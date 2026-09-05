const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');
const DpoConsentRequest = require('../models/DpoConsentRequest');
const Patient = require('../models/Patient');
const PatientIdentity = require('../models/PatientIdentity');
const Appointment = require('../models/Appointment');
const Visit = require('../models/Visit');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const SuperAdminNotification = require('../models/SuperAdminNotification');
const AuditLog = require('../models/AuditLog');
const dpoProcessingService = require('../services/dpoProcessingService');

/**
 * Middleware: ensure user is a hospital-level DPO Manager or Hospital Admin.
 * Strictly prevents cross-tenant access.
 */
const isDpoOrAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'dpo' || req.user.role === 'admin' || req.user.role === 'superadmin' || req.user.role === 'super_admin')) {
    return next();
  }
  return res.status(403).json({ error: 'Require DPO Manager or Hospital Admin role' });
};

/**
 * Real-time socket emitter helper for DPO & DPDP events
 */
const emitDpoUpdate = (req, tenantId, action, data = {}) => {
  try {
    const io = req?.app?.get('io');
    if (io && tenantId) {
      const room = String(tenantId).toLowerCase().trim();
      io.to(room).emit('data_changed', {
        type: 'dpdp-requests',
        subType: 'dpo',
        action,
        ...data
      });
      io.to(room).emit('data_changed', {
        type: 'notifications',
        category: 'dpo'
      });
      io.to(room).emit('data_changed', {
        type: 'audit-logs'
      });
    }
  } catch (err) {
    console.warn('[DPO Routes] Socket emit warning:', err.message);
  }
};

// =========================================================================
// PATIENT PORTAL ENDPOINTS
// =========================================================================

/**
 * Shared handler for Patient Consent Withdrawal Request creation.
 * Enforces:
 * 1. Mandatory hospitalId (global Curoxa withdrawal is strictly prohibited).
 * 2. Valid hospital verification in SuperAdminHospital.
 * 3. Authenticated patient + hospital relationship verification (patient must be registered in target tenant).
 * 4. Hospital-specific patient context resolution (UH-ID, Hospital Patient ID).
 * 5. Single active request per hospital constraint.
 */
const handleCreateConsentWithdrawal = async (req, res) => {
  try {
    const { hospitalId, tenantId, categories, termsAcknowledged } = req.body;

    // 1. Validate hospital context - MANDATORY (Reject missing hospital context)
    const rawHospitalCode = (hospitalId || tenantId || '').toString().toLowerCase().trim();
    if (!rawHospitalCode) {
      return res.status(400).json({
        error: 'Hospital context (hospitalId) is required. Consent withdrawal must be hospital-specific, never a global Curoxa action.'
      });
    }

    const hospital = await SuperAdminHospital.findOne({ code: rawHospitalCode });
    if (!hospital) {
      return res.status(404).json({ error: `Hospital '${rawHospitalCode}' not found.` });
    }

    const targetTenantId = hospital.code.toLowerCase().trim();

    // 2. Validate categories
    if (!categories || (!categories.personal && !categories.clinical && !categories.payment)) {
      return res.status(400).json({
        error: 'At least one withdrawal category must be selected (Personal, Clinical, or Payment).'
      });
    }

    // 3. Validate terms acknowledgement
    if (termsAcknowledged !== true) {
      return res.status(400).json({
        error: 'You must acknowledge and accept the terms and conditions before submitting.'
      });
    }

    // 4. Resolve authenticated patient identity
    const userUhid = req.user?.uhId;
    const userPhone = req.user?.phone || req.user?.contact;
    const userId = req.user?.id || req.user?.userId;
    const normalizedPhone = userPhone ? String(userPhone).replace(/\D/g, '').slice(-10) : '';

    let globalUhid = userUhid;
    if (!globalUhid && normalizedPhone) {
      const identity = await PatientIdentity.findOne({
        contact: new RegExp(normalizedPhone + '$')
      });
      if (identity) globalUhid = identity.uhId;
    }

    // 5. Verify patient's relationship with THIS SPECIFIC HOSPITAL
    const patientQueryOr = [];
    if (globalUhid) patientQueryOr.push({ uhId: globalUhid });
    if (userUhid && userUhid !== globalUhid) patientQueryOr.push({ uhId: userUhid });
    if (normalizedPhone) patientQueryOr.push({ contact: new RegExp(normalizedPhone + '$') });
    if (userPhone) patientQueryOr.push({ contact: userPhone });
    if (userId && mongoose.Types.ObjectId.isValid(userId)) patientQueryOr.push({ _id: userId });

    let patientInHospital = null;
    if (patientQueryOr.length > 0) {
      patientInHospital = await Patient.findOne({
        tenantId: targetTenantId,
        $or: patientQueryOr
      });
    }

    // Secondary check: verify if the patient has appointments or visits in this hospital
    let relatedAppt = null;
    let relatedVisit = null;
    if (!patientInHospital && patientQueryOr.length > 0) {
      const encounterOr = [];
      if (globalUhid) encounterOr.push({ uhId: globalUhid });
      if (userId && mongoose.Types.ObjectId.isValid(userId)) encounterOr.push({ patientId: userId });
      if (encounterOr.length > 0) {
        relatedAppt = await Appointment.findOne({ tenantId: targetTenantId, $or: encounterOr });
        relatedVisit = await Visit.findOne({ tenantId: targetTenantId, $or: encounterOr });
      }
    }

    // MANDATORY BACKEND ENFORCEMENT:
    // If the authenticated patient has NO relationship or registration with this hospital, reject!
    if (!patientInHospital && !relatedAppt && !relatedVisit) {
      return res.status(403).json({
        error: `Access denied. You do not have an active patient relationship or clinical records with ${hospital.name} (${targetTenantId}). You can only withdraw consent from hospitals where you are registered.`
      });
    }

    // Resolve hospital-specific identifiers
    const uhId = (patientInHospital && patientInHospital.uhId) || (relatedVisit && relatedVisit.uhId) || globalUhid;
    const hospitalPatientId = (patientInHospital && patientInHospital.patientId) || (relatedVisit && relatedVisit.hospitalPatientId) || `${targetTenantId.toUpperCase()}-PATIENT`;
    const patientMongoId = (patientInHospital && patientInHospital._id) || (relatedVisit && relatedVisit.patientId) || (relatedAppt && relatedAppt.patientId) || (mongoose.Types.ObjectId.isValid(userId) ? userId : null);
    const patientName = (patientInHospital && patientInHospital.name) || req.user?.name || 'Patient';
    const patientContact = (patientInHospital && patientInHospital.contact) || userPhone || '';

    // Check for existing active request for this hospital
    const existingRequest = await DpoConsentRequest.findOne({
      tenantId: targetTenantId,
      $or: [
        ...(uhId ? [{ uhId }] : []),
        ...(patientMongoId ? [{ patientId: patientMongoId }] : [])
      ],
      status: { $in: ['PENDING', 'READY_FOR_REVIEW'] }
    });

    if (existingRequest) {
      return res.status(400).json({
        error: `You already have an active consent withdrawal request (${existingRequest.requestId}) pending for ${hospital.name}.`
      });
    }

    // 6. Server-authoritative 72-hour deadline
    const now = new Date();
    const withdrawalWindowEndsAt = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    // 7. Unique Request ID: DPO-<HOSPITAL>-YYYYMMDD-XXXX
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const randDigits = Math.floor(1000 + Math.random() * 9000);
    const requestId = `DPO-${targetTenantId.toUpperCase()}-${dateStr}-${randDigits}`;

    const newRequest = await DpoConsentRequest.create({
      requestId,
      tenantId: targetTenantId,
      patientId: patientMongoId,
      uhId,
      hospitalPatientId,
      patientName,
      patientContact,
      categories: {
        personal: Boolean(categories.personal),
        clinical: Boolean(categories.clinical),
        payment: Boolean(categories.payment)
      },
      status: 'PENDING',
      termsAcknowledged: true,
      termsAcknowledgedAt: now,
      withdrawalWindowEndsAt,
      processingLog: [],
      auditTrail: [
        {
          action: 'REQUEST_CREATED',
          actor: String(userId || uhId),
          actorRole: 'patient',
          actorName: patientName,
          timestamp: now,
          notes: `Patient initiated hospital-specific consent withdrawal for ${hospital.name} (${targetTenantId}) covering: ${[
            categories.personal && 'Personal',
            categories.clinical && 'Clinical',
            categories.payment && 'Payment'
          ].filter(Boolean).join(', ')}`
        }
      ]
    });

    // 8. Scoped hospital notification for DPO Manager of targetTenantId
    try {
      await SuperAdminNotification.create({
        title: 'New DPO Consent Withdrawal Request',
        message: `Patient ${patientName} (${uhId}) submitted a consent withdrawal request (${requestId}) for hospital ${hospital.name}. 72-hour review window initiated.`,
        type: 'warning',
        category: 'dpo',
        metadata: {
          tenantId: targetTenantId,
          requestId,
          uhId,
          targetRole: 'dpo'
        }
      });
    } catch (notifErr) {
      console.warn('[DPO Routes] Notification dispatch warning:', notifErr.message);
    }

    // 9. Compliance & Consent Audit Log
    try {
      await AuditLog.create({
        tenantId: targetTenantId,
        actor: String(patientMongoId || userId || 'patient'),
        actorName: patientName,
        actorRole: 'patient',
        action: 'DPO_CONSENT_WITHDRAWAL_REQUESTED',
        target: requestId,
        metadata: {
          requestId,
          uhId,
          hospitalPatientId,
          hospital: hospital.name,
          categories: [
            categories.personal && 'Personal',
            categories.clinical && 'Clinical',
            categories.payment && 'Payment'
          ].filter(Boolean).join(', ')
        }
      });
    } catch (auditErr) {
      console.warn('[DPO Routes] Audit log dispatch warning:', auditErr.message);
    }

    // 10. Live sync real-time broadcast to active hospital rooms
    emitDpoUpdate(req, targetTenantId, 'created', {
      requestId,
      uhId,
      patientName
    });

    res.status(201).json({
      success: true,
      message: `Consent withdrawal request submitted successfully for ${hospital.name}. 72-hour cancellation window started.`,
      request: newRequest
    });
  } catch (err) {
    console.error('[DPO Routes] Create request error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

/**
 * POST /api/dpo/requests
 * Patient submits a new consent withdrawal request for a selected hospital.
 */
router.post('/requests', verifyToken, handleCreateConsentWithdrawal);

/**
 * POST /api/dpo/withdraw
 * Alias ensuring POST /dpo/withdraw also executes hospital-specific enforcement.
 */
router.post('/withdraw', verifyToken, handleCreateConsentWithdrawal);

/**
 * GET /api/dpo/patient/my-requests
 * Patient views all their consent withdrawal requests with live server-authoritative status.
 */
router.get('/patient/my-requests', verifyToken, async (req, res) => {
  try {
    const userUhid = req.user?.uhId;
    const userId = req.user?.id || req.user?.userId;
    const userPhone = req.user?.phone || req.user?.contact;
    const hospitalFilter = (req.query.hospitalId || req.query.tenantId || '').toString().toLowerCase().trim();

    const query = {
      $or: [
        ...(userUhid ? [{ uhId: userUhid }] : []),
        ...(userId && mongoose.Types.ObjectId.isValid(userId) ? [{ patientId: userId }] : []),
        ...(userPhone ? [{ patientContact: userPhone }] : [])
      ]
    };

    if (hospitalFilter) {
      query.tenantId = hospitalFilter;
    }

    if (query.$or.length === 0) {
      return res.json([]);
    }

    const requests = await DpoConsentRequest.find(query).sort({ createdAt: -1 });

    // Server-authoritative update: auto-advance PENDING to READY_FOR_REVIEW if 72h window expired
    const now = new Date();
    const updatedRequests = await Promise.all(
      requests.map(async (doc) => {
        if (doc.status === 'PENDING' && now >= doc.withdrawalWindowEndsAt) {
          doc.status = 'READY_FOR_REVIEW';
          await doc.save();
        }
        return doc;
      })
    );

    res.json(updatedRequests);
  } catch (err) {
    console.error('[DPO Routes] Get patient requests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/dpo/requests/:id/cancel
 * Patient cancels their withdrawal request during the 72-hour window.
 */
router.post('/requests/:id/cancel', verifyToken, async (req, res) => {
  try {
    const request = await DpoConsentRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ error: 'Consent withdrawal request not found' });
    }

    // Verify patient ownership
    const userUhid = req.user?.uhId;
    const userId = req.user?.id || req.user?.userId;
    const isOwner = (userUhid && request.uhId === userUhid) ||
                    (userId && request.patientId?.toString() === userId.toString());

    if (!isOwner && req.user?.role !== 'admin' && req.user?.role !== 'superadmin') {
      return res.status(403).json({ error: 'Unauthorized to cancel this request' });
    }

    // State check
    if (['APPROVED', 'COMPLETED', 'REJECTED', 'CANCELLED_BY_PATIENT', 'CANCELLED_BY_DPO'].includes(request.status)) {
      return res.status(400).json({ error: `Cannot cancel a request that is already ${request.status}` });
    }

    request.status = 'CANCELLED_BY_PATIENT';
    request.cancelledAt = new Date();
    request.cancelledBy = {
      id: String(userId || userUhid),
      role: 'patient',
      name: req.user?.name || request.patientName
    };
    request.cancelReason = req.body.reason || 'Cancelled by patient during 72-hour window';
    request.auditTrail.push({
      action: 'CANCELLED_BY_PATIENT',
      actor: String(userId || userUhid),
      actorRole: 'patient',
      actorName: req.user?.name || request.patientName,
      timestamp: new Date(),
      notes: request.cancelReason
    });

    await request.save();

    try {
      await AuditLog.create({
        tenantId: request.tenantId,
        actor: String(userId || userUhid),
        actorName: req.user?.name || request.patientName,
        actorRole: 'patient',
        action: 'DPO_WITHDRAWAL_CANCELLED_BY_PATIENT',
        target: request.requestId,
        metadata: {
          requestId: request.requestId,
          uhId: request.uhId,
          patientName: request.patientName,
          reason: request.cancelReason
        }
      });
    } catch (auditErr) {
      console.warn('[DPO Routes] Audit log create warning:', auditErr.message);
    }

    emitDpoUpdate(req, request.tenantId, 'cancelled_by_patient', {
      requestId: request.requestId,
      uhId: request.uhId
    });

    res.json({
      success: true,
      message: 'Consent withdrawal request successfully cancelled by patient.',
      request
    });
  } catch (err) {
    console.error('[DPO Routes] Patient cancel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =========================================================================
// HOSPITAL DPO MANAGER / HOSPITAL ADMIN ENDPOINTS (HOSPITAL-SCOPED)
// =========================================================================

/**
 * GET /api/dpo/requests
 * Hospital DPO Manager / Admin lists all requests belonging to their hospital.
 */
router.get('/requests', verifyToken, isDpoOrAdmin, async (req, res) => {
  try {
    const tenantId = String(req.tenantId || '').toLowerCase().trim();
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant identity required' });
    }

    const filter = { tenantId };

    if (req.query.status) {
      filter.status = req.query.status;
    }
    if (req.query.search) {
      const s = req.query.search.trim();
      filter.$or = [
        { requestId: { $regex: s, $options: 'i' } },
        { uhId: { $regex: s, $options: 'i' } },
        { hospitalPatientId: { $regex: s, $options: 'i' } },
        { patientName: { $regex: s, $options: 'i' } }
      ];
    }

    const requests = await DpoConsentRequest.find(filter).sort({ createdAt: -1 });

    // Server-authoritative status advance for requests whose 72h window expired
    const now = new Date();
    const updated = await Promise.all(
      requests.map(async (doc) => {
        if (doc.status === 'PENDING' && now >= doc.withdrawalWindowEndsAt) {
          doc.status = 'READY_FOR_REVIEW';
          await doc.save();
        }
        return doc;
      })
    );

    res.json(updated);
  } catch (err) {
    console.error('[DPO Routes] Staff get requests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/dpo/requests/:id
 * Hospital DPO Manager / Admin gets full detail of a specific request.
 */
router.get('/requests/:id', verifyToken, isDpoOrAdmin, async (req, res) => {
  try {
    const tenantId = String(req.tenantId || '').toLowerCase().trim();
    const request = await DpoConsentRequest.findOne({ _id: req.params.id, tenantId });
    if (!request) {
      return res.status(404).json({ error: 'Consent withdrawal request not found in your hospital' });
    }

    // Auto-advance if deadline passed
    if (request.status === 'PENDING' && new Date() >= request.withdrawalWindowEndsAt) {
      request.status = 'READY_FOR_REVIEW';
      await request.save();
    }

    res.json(request);
  } catch (err) {
    console.error('[DPO Routes] Get single request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/dpo/requests/:id/cancel-by-dpo
 * DPO Manager cancels a request with an explicit reason during the review period.
 */
router.post('/requests/:id/cancel-by-dpo', verifyToken, isDpoOrAdmin, async (req, res) => {
  try {
    const tenantId = String(req.tenantId || '').toLowerCase().trim();
    const request = await DpoConsentRequest.findOne({ _id: req.params.id, tenantId });
    if (!request) {
      return res.status(404).json({ error: 'Consent withdrawal request not found in your hospital' });
    }

    if (['COMPLETED', 'APPROVED', 'REJECTED', 'CANCELLED_BY_PATIENT', 'CANCELLED_BY_DPO'].includes(request.status)) {
      return res.status(400).json({ error: `Cannot cancel a request that is already ${request.status}` });
    }

    const reason = req.body.reason?.trim();
    if (!reason) {
      return res.status(400).json({ error: 'A cancellation reason must be provided by the DPO Manager' });
    }

    request.status = 'CANCELLED_BY_DPO';
    request.cancelledAt = new Date();
    request.cancelledBy = {
      id: req.user?.staff_id || req.user?.id,
      role: req.user?.role || 'dpo',
      name: req.user?.name || 'DPO Manager'
    };
    request.cancelReason = reason;
    request.auditTrail.push({
      action: 'CANCELLED_BY_DPO',
      actor: req.user?.staff_id || req.user?.id,
      actorRole: req.user?.role || 'dpo',
      actorName: req.user?.name || 'DPO Manager',
      timestamp: new Date(),
      notes: reason
    });

    await request.save();

    try {
      await AuditLog.create({
        tenantId,
        actor: req.user?.staff_id || req.user?.id || 'dpo',
        actorName: req.user?.name || 'DPO Manager',
        actorRole: req.user?.role || 'dpo',
        action: 'DPO_WITHDRAWAL_CANCELLED_BY_DPO',
        target: request.requestId,
        metadata: {
          requestId: request.requestId,
          uhId: request.uhId,
          patientName: request.patientName,
          reason
        }
      });
    } catch (auditErr) {
      console.warn('[DPO Routes] Audit log create warning:', auditErr.message);
    }

    emitDpoUpdate(req, tenantId, 'cancelled_by_dpo', {
      requestId: request.requestId,
      uhId: request.uhId
    });

    res.json({
      success: true,
      message: 'Request successfully cancelled by DPO Manager.',
      request
    });
  } catch (err) {
    console.error('[DPO Routes] DPO cancel error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/dpo/requests/:id/approve
 * DPO Manager approves a request.
 * MANDATORY SERVER ENFORCEMENT:
 * 1. 72-hour window must have elapsed (currentTime >= withdrawalWindowEndsAt).
 * 2. Concurrency check: request cannot be approved twice.
 * 3. Triggers category-specific safe data processing without deleting patients.
 */
router.post('/requests/:id/approve', verifyToken, isDpoOrAdmin, async (req, res) => {
  try {
    const tenantId = String(req.tenantId || '').toLowerCase().trim();
    const now = new Date();

    // 1. Fetch request and enforce server-authoritative 72-hour deadline
    const request = await DpoConsentRequest.findOne({ _id: req.params.id, tenantId });
    if (!request) {
      return res.status(404).json({ error: 'Consent withdrawal request not found in your hospital' });
    }

    if (['CANCELLED_BY_PATIENT', 'CANCELLED_BY_DPO'].includes(request.status)) {
      return res.status(400).json({ error: 'Cannot approve a request that was cancelled' });
    }

    if (['APPROVED', 'COMPLETED'].includes(request.status)) {
      return res.status(400).json({ error: 'Request has already been approved and processed' });
    }

    if (request.status === 'REJECTED') {
      return res.status(400).json({ error: 'Cannot approve a rejected request' });
    }

    // SERVER-AUTHORITATIVE 72-HOUR DEADLINE ENFORCEMENT
    if (now < new Date(request.withdrawalWindowEndsAt)) {
      const remainingMs = new Date(request.withdrawalWindowEndsAt).getTime() - now.getTime();
      const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
      return res.status(400).json({
        error: `72-hour cancellation window has not expired. Premature approval is prohibited. Approximately ${remainingHours} hour(s) remaining.`
      });
    }

    // 2. Concurrency-safe atomic transition
    const lockedRequest = await DpoConsentRequest.findOneAndUpdate(
      {
        _id: req.params.id,
        tenantId,
        status: { $in: ['PENDING', 'READY_FOR_REVIEW'] },
        withdrawalWindowEndsAt: { $lte: now }
      },
      {
        $set: {
          status: 'APPROVED',
          reviewedBy: {
            id: req.user?.staff_id || req.user?.id,
            role: req.user?.role || 'dpo',
            name: req.user?.name || 'DPO Manager'
          },
          reviewedAt: now
        },
        $push: {
          auditTrail: {
            action: 'APPROVED',
            actor: req.user?.staff_id || req.user?.id,
            actorRole: req.user?.role || 'dpo',
            actorName: req.user?.name || 'DPO Manager',
            timestamp: now,
            notes: 'Consent withdrawal approved by DPO Manager after completion of 72-hour statutory window.'
          }
        }
      },
      { new: true }
    );

    if (!lockedRequest) {
      return res.status(409).json({ error: 'Request was already modified or approved concurrently' });
    }

    // 3. Execute category-specific processing
    const processedRequest = await dpoProcessingService.processWithdrawal(lockedRequest, req.user);

    try {
      await AuditLog.create({
        tenantId,
        actor: req.user?.staff_id || req.user?.id || 'dpo',
        actorName: req.user?.name || 'DPO Manager',
        actorRole: req.user?.role || 'dpo',
        action: 'DPO_WITHDRAWAL_APPROVED',
        target: lockedRequest.requestId,
        metadata: {
          requestId: lockedRequest.requestId,
          uhId: lockedRequest.uhId,
          patientName: lockedRequest.patientName
        }
      });
    } catch (auditErr) {
      console.warn('[DPO Routes] Audit log create warning:', auditErr.message);
    }

    emitDpoUpdate(req, tenantId, 'approved', {
      requestId: lockedRequest.requestId,
      uhId: lockedRequest.uhId
    });

    res.json({
      success: true,
      message: 'Consent withdrawal approved and category-specific processing completed.',
      request: processedRequest
    });
  } catch (err) {
    console.error('[DPO Routes] Approve request error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * POST /api/dpo/requests/:id/reject
 * DPO Manager rejects a request with an explanation.
 */
router.post('/requests/:id/reject', verifyToken, isDpoOrAdmin, async (req, res) => {
  try {
    const tenantId = String(req.tenantId || '').toLowerCase().trim();
    const now = new Date();

    const request = await DpoConsentRequest.findOne({ _id: req.params.id, tenantId });
    if (!request) {
      return res.status(404).json({ error: 'Consent withdrawal request not found in your hospital' });
    }

    if (['APPROVED', 'COMPLETED', 'CANCELLED_BY_PATIENT', 'CANCELLED_BY_DPO', 'REJECTED'].includes(request.status)) {
      return res.status(400).json({ error: `Cannot reject a request that is already ${request.status}` });
    }

    // SERVER-AUTHORITATIVE 72-HOUR DEADLINE ENFORCEMENT
    if (now < new Date(request.withdrawalWindowEndsAt)) {
      const remainingMs = new Date(request.withdrawalWindowEndsAt).getTime() - now.getTime();
      const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
      return res.status(400).json({
        error: `72-hour cancellation window has not expired. Rejection is only available during or after review eligibility. Approximately ${remainingHours} hour(s) remaining.`
      });
    }

    const reason = req.body.reason?.trim();
    if (!reason) {
      return res.status(400).json({ error: 'A rejection justification reason must be provided' });
    }

    request.status = 'REJECTED';
    request.rejectionReason = reason;
    request.reviewedBy = {
      id: req.user?.staff_id || req.user?.id,
      role: req.user?.role || 'dpo',
      name: req.user?.name || 'DPO Manager'
    };
    request.reviewedAt = now;
    request.auditTrail.push({
      action: 'REJECTED',
      actor: req.user?.staff_id || req.user?.id,
      actorRole: req.user?.role || 'dpo',
      actorName: req.user?.name || 'DPO Manager',
      timestamp: now,
      notes: reason
    });

    await request.save();

    try {
      await AuditLog.create({
        tenantId,
        actor: req.user?.staff_id || req.user?.id || 'dpo',
        actorName: req.user?.name || 'DPO Manager',
        actorRole: req.user?.role || 'dpo',
        action: 'DPO_WITHDRAWAL_REJECTED',
        target: request.requestId,
        metadata: {
          requestId: request.requestId,
          uhId: request.uhId,
          patientName: request.patientName,
          reason
        }
      });
    } catch (auditErr) {
      console.warn('[DPO Routes] Audit log create warning:', auditErr.message);
    }

    emitDpoUpdate(req, tenantId, 'rejected', {
      requestId: request.requestId,
      uhId: request.uhId
    });

    res.json({
      success: true,
      message: 'Consent withdrawal request rejected.',
      request
    });
  } catch (err) {
    console.error('[DPO Routes] Reject request error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/dpo/stats
 * Summary KPI metrics for the hospital DPO Manager dashboard.
 */
router.get('/stats', verifyToken, isDpoOrAdmin, async (req, res) => {
  try {
    const tenantId = String(req.tenantId || '').toLowerCase().trim();
    const now = new Date();

    const [total, pending, completed, cancelledPatient, cancelledDpo, rejected] = await Promise.all([
      DpoConsentRequest.countDocuments({ tenantId }),
      DpoConsentRequest.countDocuments({ tenantId, status: 'PENDING', withdrawalWindowEndsAt: { $gt: now } }),
      DpoConsentRequest.countDocuments({ tenantId, status: { $in: ['APPROVED', 'COMPLETED'] } }),
      DpoConsentRequest.countDocuments({ tenantId, status: 'CANCELLED_BY_PATIENT' }),
      DpoConsentRequest.countDocuments({ tenantId, status: 'CANCELLED_BY_DPO' }),
      DpoConsentRequest.countDocuments({ tenantId, status: 'REJECTED' })
    ]);

    const readyForReview = await DpoConsentRequest.countDocuments({
      tenantId,
      $or: [
        { status: 'READY_FOR_REVIEW' },
        { status: 'PENDING', withdrawalWindowEndsAt: { $lte: now } }
      ]
    });

    res.json({
      total,
      pendingWindow: pending,
      readyForReview,
      completed,
      cancelled: cancelledPatient + cancelledDpo,
      rejected
    });
  } catch (err) {
    console.error('[DPO Routes] Get stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
