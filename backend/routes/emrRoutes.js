const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/authMiddleware');
const { checkDoctorClinicalMode } = require('../middleware/subscriptionMiddleware');
const { restrictEMRRole, checkPatientConsent, writeAudit } = require('../middleware/complianceMiddleware');

// Models
const Visit = require('../models/Visit');
const Vital = require('../models/Vital');
const ClinicalNote = require('../models/ClinicalNote');
const Consent = require('../models/Consent');
const Procedure = require('../models/Procedure');
const ClinicalDocument = require('../models/ClinicalDocument');
const Patient = require('../models/Patient');
const AuditLog = require('../models/AuditLog');
const Prescription = require('../models/Prescription');
const LabRequest = require('../models/LabRequest');
const Appointment = require('../models/Appointment');
const Billing = require('../models/Billing');

router.use(verifyToken);
router.use(checkDoctorClinicalMode);

// ==========================================
// 1. VISIT MANAGEMENT
// ==========================================

// Get all visits for a patient (scoped to tenant & consent check)
router.get('/visits/patient/:patientId', checkPatientConsent('treatment'), async (req, res) => {
  try {
    const query = req.user?.role === 'patient'
      ? { patientId: req.params.patientId }
      : { patientId: req.params.patientId, tenantId: req.tenantId };
    const visits = await Visit.find(query)
      .populate('doctorId', 'name specialty')
      .populate({
        path: 'appointmentIds',
        select: 'time date status reason doctorId tokenNumber',
        populate: { path: 'doctorId', select: 'name' }
      })
      .sort({ arrivalTimestamp: -1 });
    await writeAudit(req, req.params.patientId, 'VIEW_VISITS', 'Visit History', { count: visits.length });
    res.json(visits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new patient visit
router.post('/visits', checkPatientConsent('treatment'), restrictEMRRole(['doctor', 'nurse', 'receptionist']), async (req, res) => {
  try {
    const { patientId, doctorId, department, type, chiefComplaint, priority, queuePosition, visitId, visitEpisodeId, appointmentIds } = req.body;
    
    // Check if patient exists
    const patient = await Patient.findById(patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const { generateVisitId } = require('../utils/identifierEngine');
    const resolvedVisitId = visitId || await generateVisitId(req.tenantId);

    const visit = await Visit.create({
      tenantId: req.tenantId,
      visitId: resolvedVisitId,
      visitEpisodeId: visitEpisodeId || new mongoose.Types.ObjectId().toString(),
      patientId,
      uhId: patient.uhId || '',
      hospitalPatientId: patient.patientId || '',
      doctorId: doctorId || null,
      appointmentIds: Array.isArray(appointmentIds) ? appointmentIds : [],
      department: department || 'OPD',
      type: type || 'OPD',
      chiefComplaint,
      priority: priority || 'Green',
      queuePosition,
      status: 'Checked-in'
    });

    await writeAudit(req, patientId, 'CREATE_VISIT', 'Visit', { visitId: visit._id, type });
    
    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "visits" });
    }

    res.status(201).json(visit);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update visit details / status
router.put('/visits/:id', restrictEMRRole(['doctor', 'nurse', 'receptionist']), async (req, res) => {
  try {
    const { status, priority, chiefComplaint } = req.body;
    const visit = await Visit.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!visit) return res.status(404).json({ error: 'Visit not found' });

    if (status) visit.status = status;
    if (priority) visit.priority = priority;
    if (chiefComplaint) visit.chiefComplaint = chiefComplaint;

    await visit.save();
    await writeAudit(req, visit.patientId, 'UPDATE_VISIT', 'Visit', { visitId: visit._id, status });

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "visits" });
    }

    res.json(visit);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


// ==========================================
// 2. VITALS TRACKING
// ==========================================

// Get vitals history for a patient
router.get('/vitals/patient/:patientId', checkPatientConsent('treatment'), restrictEMRRole(['doctor', 'nurse', 'patient', 'receptionist', 'lab', 'admin']), async (req, res) => {
  try {
    const query = req.user?.role === 'patient'
      ? { patientId: req.params.patientId }
      : { patientId: req.params.patientId, tenantId: req.tenantId };
    const vitals = await Vital.find(query).populate('recordedBy', 'name').sort({ createdAt: -1 });
    await writeAudit(req, req.params.patientId, 'VIEW_VITALS', 'Vitals History', { count: vitals.length });
    res.json(vitals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Record new vitals
router.post('/vitals', checkPatientConsent('treatment'), restrictEMRRole(['doctor', 'nurse', 'receptionist', 'lab', 'admin']), async (req, res) => {
  try {
    const { patientId, visitId, temperature, pulse, respiration, bpSys, bpDia, height, weight, spo2, painScore, bloodSugar, sugarType, ecgFile } = req.body;
    
    const vital = new Vital({
      tenantId: req.tenantId,
      patientId,
      visitId,
      recordedBy: req.user.id,
      temperature: parseFloat(temperature),
      pulse: parseInt(pulse),
      respiration: parseInt(respiration),
      bpSys: parseInt(bpSys),
      bpDia: parseInt(bpDia),
      height: parseFloat(height),
      weight: parseFloat(weight),
      spo2: parseInt(spo2),
      painScore: parseInt(painScore),
      bloodSugar: parseFloat(bloodSugar),
      sugarType,
      ecgFile
    });

    await vital.save();
    await writeAudit(req, patientId, 'RECORD_VITALS', 'Vitals', { vitalId: vital._id });

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "vitals" });
    }

    res.status(201).json(vital);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


// ==========================================
// 3. SOAP CLINICAL NOTES
// ==========================================

// Get SOAP notes history
router.get('/clinical-notes/patient/:patientId', checkPatientConsent('treatment'), restrictEMRRole(['doctor', 'patient']), async (req, res) => {
  try {
    const query = req.user?.role === 'patient'
      ? { patientId: req.params.patientId }
      : { patientId: req.params.patientId, tenantId: req.tenantId };
    const notes = await ClinicalNote.find(query).populate('doctorId', 'name').sort({ createdAt: -1 });
    await writeAudit(req, req.params.patientId, 'VIEW_CLINICAL_NOTES', 'Clinical SOAP Notes', { count: notes.length });
    res.json(notes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save or Update SOAP clinical note (creates revisions if already finalized)
router.post('/clinical-notes', checkPatientConsent('treatment'), restrictEMRRole(['doctor']), async (req, res) => {
  try {
    const { patientId, visitId, subjective, objective, assessment, plan, voiceDictationUrl, isDraft } = req.body;

    let note = await ClinicalNote.findOne({ visitId, tenantId: req.tenantId });
    
    if (note) {
      // If note is finalized (not a draft), save to history for clinical versioning before updating
      if (!note.isDraft) {
        note.history.push({
          subjective: note.subjective,
          objective: note.objective,
          assessment: note.assessment,
          plan: note.plan,
          modifiedBy: req.user.id,
          updatedAt: new Date()
        });
      }
      
      note.subjective = subjective || note.subjective;
      note.objective = objective || note.objective;
      note.assessment = assessment || note.assessment;
      note.plan = plan || note.plan;
      note.voiceDictationUrl = voiceDictationUrl !== undefined ? voiceDictationUrl : note.voiceDictationUrl;
      note.isDraft = isDraft !== undefined ? isDraft : note.isDraft;
      
      await note.save();
      await writeAudit(req, patientId, note.isDraft ? 'SAVE_DRAFT_CLINICAL_NOTE' : 'FINALIZE_CLINICAL_NOTE', 'ClinicalNote', { noteId: note._id });
    } else {
      note = await ClinicalNote.create({
        tenantId: req.tenantId,
        patientId,
        visitId,
        doctorId: req.user.id,
        subjective,
        objective,
        assessment: Array.isArray(assessment) ? assessment : (assessment ? [assessment] : []),
        plan,
        voiceDictationUrl,
        isDraft: isDraft !== undefined ? isDraft : true
      });
      await writeAudit(req, patientId, note.isDraft ? 'CREATE_DRAFT_CLINICAL_NOTE' : 'CREATE_CLINICAL_NOTE', 'ClinicalNote', { noteId: note._id });
    }

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "clinical-notes" });
    }

    res.json(note);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Finalize SOAP note & digitally sign
router.put('/clinical-notes/:id/finalize', restrictEMRRole(['doctor']), async (req, res) => {
  try {
    const { digitalSignature } = req.body;
    const note = await ClinicalNote.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!note) return res.status(404).json({ error: 'Clinical note not found' });

    note.isDraft = false;
    note.digitalSignature = digitalSignature || `Digitally signed by Doctor ID: ${req.user.id} at ${new Date().toISOString()}`;
    await note.save();

    await writeAudit(req, note.patientId, 'FINALIZE_SIGN_CLINICAL_NOTE', 'ClinicalNote', { noteId: note._id });

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "clinical-notes" });
    }

    res.json(note);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


// ==========================================
// 4. CONSENT & DPDP MANAGEMENT
// ==========================================

// Gate all DPDP consent routes under the dpdp subscription module
const { checkModule } = require('../middleware/subscriptionMiddleware');
router.use('/consent', checkModule('dpdp'));

// Get current consent state
router.get('/consent/patient/:patientId', async (req, res) => {
  try {
    // Only patient themselves, admin, or treating doctor can view consent
    const isPatientSelf = req.user.role === 'patient';
    const isDoc = req.user.role === 'doctor';
    const isAdm = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isPatientSelf && !isDoc && !isAdm) {
      return res.status(403).json({ error: 'Access denied to consent records' });
    }

    let consent = await (req.user?.role === 'patient'
      ? Consent.findOne({ patientId: req.params.patientId })
      : Consent.findOne({ patientId: req.params.patientId, tenantId: req.tenantId }));
    if (!consent) {
      // Return default empty consent
      consent = {
        patientId: req.params.patientId,
        purposes: { treatment: true, insurance: true, research: false },
        status: 'Active',
        dpdpRequests: []
      };
    }
    res.json(consent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Log emergency bypass override (Break-Glass action)
router.post('/consent/patient/:patientId/bypass-log', restrictEMRRole(['doctor']), async (req, res) => {
  try {
    const { reason, actionContext } = req.body;
    if (!reason || reason.trim() === '') {
      return res.status(400).json({ error: 'A justification reason is required for emergency consent bypass.' });
    }
    
    // Log the override bypass in the audit trail with high severity
    await writeAudit(req, req.params.patientId, 'EMERGENCY_BYPASS_EXECUTED', 'Consent Registry', {
      reason,
      actionContext: actionContext || 'EMR Access Override',
      severity: 'HIGH_PRIORITY'
    });
    
    res.json({ success: true, message: 'Emergency Break-Glass bypass logged successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update or sign consent registry
router.post('/consent', async (req, res) => {
  try {
    const { patientId, purposes, status, signature } = req.body;
    
    // Security: Only patient themselves or admin can update consent settings
    const isPatientSelf = req.user.role === 'patient';
    const isAdm = req.user.role === 'admin';
    if (!isPatientSelf && !isAdm) {
      return res.status(403).json({ error: 'Access denied: Only patients or administrators can manage consent registers' });
    }

    let consent = await Consent.findOne({ patientId, tenantId: req.tenantId });
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ua = req.headers['user-agent'];

    if (consent) {
      // Save current status to audit history
      consent.history.push({
        purposes: consent.purposes,
        status: consent.status,
        ipAddress: consent.ipAddress,
        userAgent: consent.userAgent,
        actionTimestamp: new Date()
      });

      consent.purposes = purposes || consent.purposes;
      consent.status = status || consent.status;
      consent.signature = signature || consent.signature;
      consent.ipAddress = ip;
      consent.userAgent = ua;

      await consent.save();
      await writeAudit(req, patientId, 'UPDATE_CONSENT', 'Consent Registry', { status: consent.status });
    } else {
      consent = await Consent.create({
        tenantId: req.tenantId,
        patientId,
        purposes: purposes || { treatment: true, insurance: true, research: false },
        status: status || 'Active',
        signature: signature || 'Digitally Signed',
        ipAddress: ip,
        userAgent: ua,
        history: []
      });
      await writeAudit(req, patientId, 'CREATE_CONSENT', 'Consent Registry', { status: consent.status });
    }

    res.json(consent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Submit a DPDP request (correction or deletion)
router.post('/consent/patient/:patientId/dpdp-request', async (req, res) => {
  try {
    const { requestType, details } = req.body;
    const patientId = req.params.patientId;

    // Verify ownership
    const isPatientSelf = req.user.role === 'patient';
    const isAdm = req.user.role === 'admin';
    if (!isPatientSelf && !isAdm) {
      return res.status(403).json({ error: 'Unauthorized to submit compliance request' });
    }

    let consent = await Consent.findOne({ patientId, tenantId: req.tenantId });
    if (!consent) {
      // Create a skeleton consent record if it doesn't exist yet
      consent = await Consent.create({
        tenantId: req.tenantId,
        patientId,
        purposes: { treatment: true, insurance: true, research: false },
        status: 'Active',
        signature: 'System Init'
      });
    }

    // Check if user requests deletion, but patient has a legal hold
    if (requestType === 'Deletion') {
      const patient = await Patient.findById(patientId);
      if (patient && patient.legalHold) {
        consent.dpdpRequests.push({
          requestType,
          details,
          status: 'Hold',
          resolutionNotes: 'Deletion request placed on Hold due to active legal hold/pending investigation.'
        });
        await consent.save();
        await writeAudit(req, patientId, 'DPDP_DELETION_HOLD', 'Consent Registry', { details });
        return res.json({ message: 'Request submitted. However, a legal hold is active on this account. Deletion is temporarily paused.', consent });
      }
    }

    consent.dpdpRequests.push({
      requestType,
      details,
      status: 'Pending'
    });

    await consent.save();
    await writeAudit(req, patientId, `DPDP_${requestType.toUpperCase()}_SUBMITTED`, 'Consent Registry', { details });

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "dpdp-requests" });
    }

    res.json(consent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get DPDP requests (Admin or Patient)
router.get('/consent/patient/:patientId/dpdp-requests', async (req, res) => {
  try {
    const consent = await Consent.findOne({ patientId: req.params.patientId, tenantId: req.tenantId });
    res.json(consent ? consent.dpdpRequests : []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all DPDP requests for admin review
router.get('/consent/dpdp-requests/all', restrictEMRRole(['admin']), async (req, res) => {
  try {
    const rawTenant = req.tenantId || '';
    const tenantLower = String(rawTenant).toLowerCase().trim();
    const tenantQuery = { $in: [rawTenant, tenantLower].filter(Boolean) };

    const consents = await Consent.find({ tenantId: tenantQuery }).populate('patientId', 'name contact age gender');
    let allRequests = [];
    consents.forEach(c => {
      if (c.dpdpRequests && c.dpdpRequests.length > 0) {
        c.dpdpRequests.forEach(reqItem => {
          allRequests.push({
            _id: reqItem._id,
            patientId: c.patientId ? c.patientId._id : c.patientId,
            patientName: c.patientId ? c.patientId.name : 'Unknown Patient',
            patientContact: c.patientId ? c.patientId.contact : 'N/A',
            patientAgeGender: c.patientId ? `${c.patientId.age || '--'} ${c.patientId.gender?.[0] || 'U'}` : 'N/A',
            requestType: reqItem.requestType,
            details: reqItem.details,
            status: reqItem.status,
            resolutionNotes: reqItem.resolutionNotes,
            requestedAt: reqItem.requestedAt,
            resolvedAt: reqItem.resolvedAt
          });
        });
      }
    });

    // Also include DPO Consent Withdrawal Requests for this hospital
    try {
      const DpoConsentRequest = require('../models/DpoConsentRequest');
      const dpoReqs = await DpoConsentRequest.find({ tenantId: tenantQuery }).sort({ createdAt: -1 });
      dpoReqs.forEach(d => {
        const catLabels = [
          d.categories?.personal && 'Personal Data',
          d.categories?.clinical && 'Clinical History',
          d.categories?.payment && 'Financial & Billing'
        ].filter(Boolean).join(', ') || 'All Categories';

        let mappedStatus = 'Pending';
        if (d.status === 'APPROVED' || d.status === 'COMPLETED') mappedStatus = 'Approved';
        else if (d.status === 'REJECTED' || d.status === 'CANCELLED_BY_PATIENT' || d.status === 'CANCELLED_BY_DPO') mappedStatus = 'Rejected';

        allRequests.push({
          _id: d._id,
          isDpo: true,
          requestId: d.requestId,
          uhId: d.uhId,
          hospitalPatientId: d.hospitalPatientId,
          patientId: d.patientId,
          patientName: d.patientName || 'Patient',
          patientContact: d.patientContact || 'N/A',
          patientAgeGender: d.uhId ? `UHID: ${d.uhId}` : 'N/A',
          requestType: 'Consent Withdrawal',
          details: `Scope: ${catLabels}. Request ID: ${d.requestId}. UHID: ${d.uhId}.${d.cancelReason ? ` (Cancelled: ${d.cancelReason})` : ''}${d.rejectionReason ? ` (Rejected: ${d.rejectionReason})` : ''}`,
          status: mappedStatus,
          rawStatus: d.status,
          categories: d.categories,
          withdrawalWindowEndsAt: d.withdrawalWindowEndsAt,
          resolutionNotes: d.rejectionReason || d.cancelReason || (d.reviewedBy ? `Reviewed by ${d.reviewedBy.name}` : ''),
          requestedAt: d.createdAt,
          resolvedAt: d.reviewedAt || d.cancelledAt
        });
      });
    } catch (dpoErr) {
      console.warn('[EMR Routes] DPO requests fetch fallback warning:', dpoErr.message);
    }

    allRequests.sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0));
    res.json(allRequests);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin review of DPDP Request
router.put('/consent/dpdp-request/:requestId', restrictEMRRole(['admin']), async (req, res) => {
  try {
    const { status, resolutionNotes } = req.body; // Approved, Rejected, Hold
    const rawTenant = req.tenantId || '';
    const tenantLower = String(rawTenant).toLowerCase().trim();
    const tenantQuery = { $in: [rawTenant, tenantLower].filter(Boolean) };

    const consent = await Consent.findOne({ 'dpdpRequests._id': req.params.requestId, tenantId: tenantQuery });
    if (!consent) {
      // Check if this is a DpoConsentRequest
      const DpoConsentRequest = require('../models/DpoConsentRequest');
      const dpoReq = await DpoConsentRequest.findOne({ _id: req.params.requestId, tenantId: tenantQuery });
      if (dpoReq) {
        const now = new Date();
        if (status === 'Approved') {
          if (now < new Date(dpoReq.withdrawalWindowEndsAt)) {
            return res.status(400).json({ error: '72-hour cancellation window has not expired. Premature approval is prohibited.' });
          }
          dpoReq.status = 'APPROVED';
          dpoReq.reviewedBy = {
            id: req.user?.staff_id || req.user?.id,
            role: req.user?.role || 'admin',
            name: req.user?.name || 'Hospital Admin'
          };
          dpoReq.reviewedAt = now;
          const dpoProcessingService = require('../services/dpoProcessingService');
          await dpoProcessingService.processWithdrawal(dpoReq, req.user);
        } else if (status === 'Rejected') {
          dpoReq.status = 'REJECTED';
          dpoReq.rejectionReason = resolutionNotes || 'Rejected by hospital administrator';
          dpoReq.reviewedBy = {
            id: req.user?.staff_id || req.user?.id,
            role: req.user?.role || 'admin',
            name: req.user?.name || 'Hospital Admin'
          };
          dpoReq.reviewedAt = now;
        } else if (status === 'Hold') {
          dpoReq.status = 'CANCELLED_BY_DPO';
          dpoReq.cancelReason = resolutionNotes || 'Placed on hold / cancelled by administrator';
          dpoReq.cancelledBy = {
            id: req.user?.staff_id || req.user?.id,
            role: req.user?.role || 'admin',
            name: req.user?.name || 'Hospital Admin'
          };
          dpoReq.cancelledAt = now;
        }
        await dpoReq.save();
        const io = req.app.get("io");
        if (io && tenantLower) {
          io.to(tenantLower).emit("data_changed", { type: "dpdp-requests" });
          io.to(tenantLower).emit("data_changed", { type: "notifications" });
        }
        return res.json({ success: true, request: dpoReq });
      }
      return res.status(404).json({ error: 'Request not found' });
    }

    const reqItem = consent.dpdpRequests.id(req.params.requestId);
    reqItem.status = status;
    reqItem.resolutionNotes = resolutionNotes;
    reqItem.resolvedAt = new Date();

    await consent.save();
    await writeAudit(req, consent.patientId, `DPDP_REQUEST_RESOLVED`, 'Consent Registry', { requestId: req.params.requestId, status, resolutionNotes });

    // If deletion request is approved, execute deletion of medical files (if permitted/no legal hold)
    if (status === 'Approved' && reqItem.requestType === 'Deletion') {
      const patientObj = await Patient.findById(consent.patientId);
      if (patientObj && !patientObj.legalHold) {
        // Delete clinical note, vitals, procedures, and patient record itself cascadingly
        await ClinicalNote.deleteMany({ patientId: consent.patientId });
        await Vital.deleteMany({ patientId: consent.patientId });
        await Procedure.deleteMany({ patientId: consent.patientId });
        await ClinicalDocument.deleteMany({ patientId: consent.patientId });
        await Prescription.deleteMany({ patientId: consent.patientId });
        await LabRequest.deleteMany({ patientId: consent.patientId });
        await Visit.deleteMany({ patientId: consent.patientId });
        await Appointment.deleteMany({ patientId: consent.patientId });
        await Billing.deleteMany({ patientId: consent.patientId });
        await Consent.deleteMany({ patientId: consent.patientId });
        await Patient.findByIdAndDelete(consent.patientId);
        
        // Mark user account as inactive
        const User = require('../models/User');
        await User.findOneAndDelete({ staff_id: patientObj.contact, tenantId: req.tenantId });

        await writeAudit(req, consent.patientId, `PATIENT_RECORD_PERMANENTLY_DELETED`, 'Compliance Registry', { reason: 'DPDP Deletion Request Approved' });
        return res.json({ message: 'Patient medical record permanently deleted from hospital databases.' });
      }
    }

    const io = req.app.get("io");
    if (io && tenantLower) {
      io.to(tenantLower).emit("data_changed", { type: "dpdp-requests" });
    }

    res.json(consent);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


// ==========================================
// 5. PROCEDURES & SURGERY LOGGING
// ==========================================

// Get procedures history
router.get('/procedures/patient/:patientId', checkPatientConsent('treatment'), restrictEMRRole(['doctor', 'patient']), async (req, res) => {
  try {
    const query = req.user?.role === 'patient'
      ? { patientId: req.params.patientId }
      : { patientId: req.params.patientId, tenantId: req.tenantId };
    const procedures = await Procedure.find(query).populate('doctorId', 'name').sort({ createdAt: -1 });
    await writeAudit(req, req.params.patientId, 'VIEW_PROCEDURES', 'Procedures History', { count: procedures.length });
    res.json(procedures);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Log new surgery / procedure
router.post('/procedures', checkPatientConsent('treatment'), restrictEMRRole(['doctor']), async (req, res) => {
  try {
    const { patientId, visitId, procedureName, preOpNotes, postOpNotes, anesthesiaDetails, implants, consentFormUrl, charges, status } = req.body;
    
    const proc = await Procedure.create({
      tenantId: req.tenantId,
      patientId,
      visitId,
      doctorId: req.user.id,
      procedureName,
      preOpNotes,
      postOpNotes,
      anesthesiaDetails,
      implants,
      consentFormUrl,
      charges: parseFloat(charges) || 0,
      status: status || 'Scheduled'
    });

    await writeAudit(req, patientId, 'LOG_PROCEDURE', 'Procedure', { procedureId: proc._id, name: procedureName });

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "procedures" });
    }

    res.status(201).json(proc);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


// ==========================================
// 6. CLINICAL DOCUMENTS
// ==========================================

// Get clinical documents
router.get('/documents/patient/:patientId', checkPatientConsent('treatment'), restrictEMRRole(['doctor', 'patient']), async (req, res) => {
  try {
    const query = req.user?.role === 'patient'
      ? { patientId: req.params.patientId }
      : { patientId: req.params.patientId, tenantId: req.tenantId };
    const docs = await ClinicalDocument.find(query).populate('uploadedBy', 'name').sort({ createdAt: -1 });
    await writeAudit(req, req.params.patientId, 'VIEW_CLINICAL_DOCUMENTS', 'Clinical Documents Vault', { count: docs.length });
    res.json(docs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload document
router.post('/documents', checkPatientConsent('treatment'), restrictEMRRole(['doctor']), async (req, res) => {
  try {
    const { patientId, title, category, fileUrl } = req.body;
    const doc = await ClinicalDocument.create({
      tenantId: req.tenantId,
      patientId,
      title,
      category,
      fileUrl,
      uploadedBy: req.user.id
    });

    await writeAudit(req, patientId, 'UPLOAD_CLINICAL_DOCUMENT', 'Clinical Document', { docId: doc._id, title });

    const io = req.app.get("io");
    if (io && req.tenantId) {
      io.to(req.tenantId).emit("data_changed", { type: "clinical-documents" });
    }

    res.status(201).json(doc);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


// ==========================================
// 7. SIMULATED KYC & ABDM/ABHA
// ==========================================

// Aadhaar verification simulation
router.post('/verify-aadhaar', async (req, res) => {
  const { aadhaarNumber } = req.body;
  if (!aadhaarNumber || aadhaarNumber.length !== 12 || isNaN(aadhaarNumber)) {
    return res.status(400).json({ error: 'Aadhaar must be a 12-digit numeric code' });
  }
  // Simulate OTP verify
  res.json({
    success: true,
    message: 'Aadhaar E-KYC verified successfully',
    demographics: {
      name: 'Kunal Kumar',
      gender: 'Male',
      dob: '1992-05-18',
      address: 'Sector 62, Noida, UP - 201301'
    }
  });
});

// ABHA Card verification/generation simulation
router.post('/verify-abha', async (req, res) => {
  const { abhaId } = req.body;
  if (!abhaId) return res.status(400).json({ error: 'ABHA ID or contact details required' });
  
  // Generate random ABDM address
  const randomAbhaAddress = `${abhaId.toLowerCase().replace(/[^a-z0-9]/g, '')}@abdm`;
  const formattedAbhaId = abhaId.includes('-') ? abhaId : '91-2093-4820-2104';

  res.json({
    success: true,
    message: 'ABHA Health ID linked with ABDM successfully',
    abhaAddress: randomAbhaAddress,
    abhaId: formattedAbhaId
  });
});


// ==========================================
// 8. AUDIT LOGS RETRIEVAL (COMPLIANCE)
// ==========================================

// Get audit logs for a patient (Patient privacy dashboard views this)
router.get('/audits/patient/:patientId', async (req, res) => {
  try {
    const isPatientSelf = req.user.role === 'patient';
    const isAdm = req.user.role === 'admin' || req.user.role === 'superadmin';
    if (!isPatientSelf && !isAdm) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const query = isPatientSelf
      ? { target: req.params.patientId }
      : { target: req.params.patientId, tenantId: req.tenantId };
    const audits = await AuditLog.find(query).sort({ timestamp: -1 });
    res.json(audits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all audit logs (Admin only)
router.get('/audits/all', restrictEMRRole(['admin']), async (req, res) => {
  try {
    const audits = await AuditLog.find({ tenantId: req.tenantId }).sort({ timestamp: -1 }).limit(100);
    res.json(audits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ==========================================
// 9. DASHBOARD ANALYTICS & DATA RETENTION
// ==========================================

// Get metrics for EMR Completion & Dashboard
router.get('/dashboard-metrics', restrictEMRRole(['doctor', 'nurse', 'admin']), async (req, res) => {
  try {
    const visits = await Visit.find({ tenantId: req.tenantId });
    const clinicalNotesCount = await ClinicalNote.countDocuments({ tenantId: req.tenantId, isDraft: false });
    const pendingNotesCount = await ClinicalNote.countDocuments({ tenantId: req.tenantId, isDraft: true });
    const prescriptionsCount = await Prescription.countDocuments({ tenantId: req.tenantId });
    const labReportsCount = await LabRequest.countDocuments({ tenantId: req.tenantId, status: 'Completed' });
    
    // Triage levels
    const opdCount = visits.filter(v => v.type === 'OPD').length;
    const ipdCount = visits.filter(v => v.type === 'IPD').length;
    const emergencyCount = visits.filter(v => v.type === 'Emergency').length;

    // Recent audits
    const recentAudits = await AuditLog.find({ tenantId: req.tenantId }).sort({ timestamp: -1 }).limit(8);

    res.json({
      opdCount,
      ipdCount,
      emergencyCount,
      completedNotes: clinicalNotesCount,
      pendingNotes: pendingNotesCount,
      prescriptionsCount,
      labReportsCount,
      recentAudits
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DPDP Data Retention Trigger (Admin executes cleanup of expired, non-held accounts)
router.post('/retention/cleanup', restrictEMRRole(['admin']), async (req, res) => {
  try {
    const expiredPatients = await Patient.find({
      tenantId: req.tenantId,
      legalHold: false,
      retentionExpiry: { $lt: new Date() }
    });

    let deletedCount = 0;
    for (const pat of expiredPatients) {
      await ClinicalNote.deleteMany({ patientId: pat._id });
      await Vital.deleteMany({ patientId: pat._id });
      await Procedure.deleteMany({ patientId: pat._id });
      await ClinicalDocument.deleteMany({ patientId: pat._id });
      await Prescription.deleteMany({ patientId: pat._id });
      await LabRequest.deleteMany({ patientId: pat._id });
      await Patient.findByIdAndDelete(pat._id);
      
      const User = require('../models/User');
      await User.findOneAndDelete({ staff_id: pat.contact, tenantId: req.tenantId });

      await AuditLog.create({
        tenantId: req.tenantId,
        actor: req.user.id,
        actorName: req.user.name || 'System Compliance',
        actorRole: 'admin',
        action: 'RETENTION_CLEANUP_DELETION',
        target: String(pat._id),
        metadata: { name: pat.name, contact: pat.contact }
      });
      deletedCount++;
    }

    res.json({ success: true, message: `Successfully cleared ${deletedCount} records whose retention policy expired.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
