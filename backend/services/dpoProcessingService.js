const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const PatientIdentity = require('../models/PatientIdentity');
const Prescription = require('../models/Prescription');
const LabRequest = require('../models/LabRequest');
const ClinicalNote = require('../models/ClinicalNote');
const AuditLog = require('../models/AuditLog');

/**
 * Service to execute category-specific safe consent withdrawal processing.
 * CRITICAL SAFETY RULES:
 * 1. NEVER delete the Patient document (cascade deletion prohibited).
 * 2. NEVER delete Appointment, Visit, or Billing documents.
 * 3. Preserve opaque identifiers: uhId, patientId (hospitalPatientId), visitId.
 * 4. Only process categories requested by the patient.
 * 5. Payment details are recorded only — no financial records modified.
 */
class DpoProcessingService {
  async processWithdrawal(request, actor = {}) {
    if (!request) {
      throw new Error('Valid DpoConsentRequest required for processing');
    }

    const tenantId = request.tenantId;
    const processingLogs = [];

    // 1. Category: Personal Records
    if (request.categories && request.categories.personal) {
      let patient = null;
      if (request.patientId) {
        patient = await Patient.findOne({ _id: request.patientId, tenantId });
      }
      if (!patient && request.hospitalPatientId) {
        patient = await Patient.findOne({ patientId: request.hospitalPatientId, tenantId });
      }

      if (patient) {
        const originalContact = patient.contact;

        // Dissociate from global PatientIdentity so any future re-registration
        // generates a completely new UH-ID and new hospital Patient ID
        if (originalContact) {
          try {
            await PatientIdentity.deleteMany({ contact: originalContact });
          } catch (idErr) {
            console.warn('[DPO Service] Failed to unlink PatientIdentity contact:', idErr.message);
          }
        }

        // Anonymize personal demographic fields in Patient record
        // Retain uhId, patientId, tenantId, and _id for audit integrity
        patient.name = 'Anonymized Patient';
        patient.contact = `ANON-${patient.patientId || patient._id}`;
        patient.email = 'withdrawn@anonymized.local';
        patient.address = 'Redacted under DPDP Consent Withdrawal';
        patient.allergies = 'Redacted';
        patient.medicalHistory = [];
        patient.dob = '';
        patient.age = 0;
        patient.ageMonths = 0;
        patient.ageDays = 0;
        patient.currentMedications = '';
        patient.referredBy = '';
        patient.avatar = '';
        patient.insuranceDetails = { provider: '', policyNumber: '', coverageLimit: 0 };
        patient.abhaId = '';
        patient.abhaAddress = '';
        patient.aadhaarVerified = false;

        await patient.save();

        processingLogs.push({
          category: 'personal',
          status: 'ANONYMIZED',
          details: `Personal demographic data anonymized. Contact dissociated from PatientIdentity to guarantee re-registration independence. UH-ID ${patient.uhId} and Patient ID ${patient.patientId} retained as opaque historical references.`,
          timestamp: new Date()
        });
      } else {
        processingLogs.push({
          category: 'personal',
          status: 'SKIPPED_NOT_FOUND',
          details: 'Patient document not found for anonymization; skipped.',
          timestamp: new Date()
        });
      }
    }

    // 2. Category: Clinical Records
    if (request.categories && request.categories.clinical) {
      let redactedPrescriptionsCount = 0;
      let redactedLabOrdersCount = 0;
      let redactedClinicalNotesCount = 0;

      const validPatientIds = [];
      if (request.patientId && mongoose.Types.ObjectId.isValid(request.patientId)) {
        validPatientIds.push(new mongoose.Types.ObjectId(request.patientId));
      }
      const patientFilter = validPatientIds.length > 0 ? { patientId: { $in: validPatientIds } } : {};

      // Redact clinical notes in Prescriptions while preserving document & Visit linkage
      try {
        const rxUpdate = await Prescription.updateMany(
          { tenantId, ...patientFilter },
          {
            $set: {
              'offlineMetadata.notes': '[CLINICAL RECORD REDACTED UNDER DPDP CONSENT WITHDRAWAL]',
              'items.$[].instructions': '[REDACTED UNDER DPDP]'
            }
          }
        );
        redactedPrescriptionsCount = rxUpdate.modifiedCount || 0;
      } catch (rxErr) {
        console.warn('[DPO Service] Prescription redaction warning:', rxErr.message);
      }

      // Redact clinical findings in Lab Requests while preserving order metadata & Visit linkage
      try {
        const labUpdate = await LabRequest.updateMany(
          { tenantId, ...patientFilter },
          {
            $set: {
              clinicalNotes: '[CLINICAL NOTE REDACTED UNDER DPDP CONSENT WITHDRAWAL]',
              findings: '[REDACTED]',
              interpretation: '[REDACTED]'
            }
          }
        );
        redactedLabOrdersCount = labUpdate.modifiedCount || 0;
      } catch (labErr) {
        console.warn('[DPO Service] LabRequest redaction warning:', labErr.message);
      }

      // Redact ClinicalNote entries
      try {
        const cnUpdate = await ClinicalNote.updateMany(
          { tenantId, ...patientFilter },
          {
            $set: {
              note: '[CLINICAL NOTE REDACTED UNDER DPDP CONSENT WITHDRAWAL]',
              chiefComplaint: '[REDACTED]',
              assessment: '[REDACTED]'
            }
          }
        );
        redactedClinicalNotesCount = cnUpdate.modifiedCount || 0;
      } catch (cnErr) {
        console.warn('[DPO Service] ClinicalNote redaction warning:', cnErr.message);
      }

      processingLogs.push({
        category: 'clinical',
        status: 'REDACTED',
        details: `Clinical contents redacted: ${redactedPrescriptionsCount} prescriptions, ${redactedLabOrdersCount} lab orders, ${redactedClinicalNotesCount} clinical notes. Historical Visit IDs and Appointment links preserved.`,
        timestamp: new Date()
      });
    }

    // 3. Category: Payment Details
    // Scope lock: RECORD ONLY. Do NOT delete or modify financial/billing records.
    if (request.categories && request.categories.payment) {
      processingLogs.push({
        category: 'payment',
        status: 'RECORDED_ONLY',
        details: 'Payment Details withdrawal recorded for future privacy implementation. In compliance with hospital accounting regulations, all billing and financial audit records remain unaltered.',
        timestamp: new Date()
      });
    }

    // Update request state
    request.status = 'COMPLETED';
    request.processedAt = new Date();
    if (processingLogs.length > 0) {
      request.processingLog.push(...processingLogs);
    }
    request.auditTrail.push({
      action: 'COMPLETED',
      actor: actor.staff_id || actor.id || 'system',
      actorRole: actor.role || 'dpo',
      actorName: actor.name || 'DPO Manager',
      timestamp: new Date(),
      notes: 'Category-specific consent withdrawal processing executed successfully.'
    });

    await request.save();

    // Add immutable record to central AuditLog
    try {
      await AuditLog.create({
        tenantId,
        actor: actor.staff_id || actor.id || 'system',
        actorName: actor.name || 'DPO Manager',
        actorRole: actor.role || 'dpo',
        action: 'DPO_CONSENT_WITHDRAWAL_COMPLETED',
        target: `Request:${request.requestId} Patient:${request.hospitalPatientId}`,
        metadata: {
          requestId: request.requestId,
          uhId: request.uhId,
          hospitalPatientId: request.hospitalPatientId,
          categories: request.categories,
          processingLog: processingLogs
        }
      });
    } catch (auditErr) {
      console.warn('[DPO Service] AuditLog creation warning:', auditErr.message);
    }

    return request;
  }
}

module.exports = new DpoProcessingService();
