const AuditLog = require('../models/AuditLog');
const Consent = require('../models/Consent');
const Patient = require('../models/Patient');

// Helper for writing audit logs
const writeAudit = async (req, patientId, action, target, metadata = {}) => {
  try {
    await AuditLog.create({
      tenantId: req.tenantId || 'city_hospital',
      actor: req.user?.id || 'system',
      actorName: req.user?.name || req.user?.username || 'System User',
      actorRole: req.user?.role || 'system',
      action,
      target: target || String(patientId),
      metadata: {
        ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        ...metadata
      }
    });
  } catch (err) {
    console.error('[AUDIT ERROR]', err);
  }
};

// Middleware to restrict access based on Role (RBAC)
const restrictEMRRole = (allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user?.role;
    if (!userRole) {
      return res.status(403).json({ error: 'Access denied: No role specified' });
    }

    if (userRole === 'admin' || userRole === 'superadmin') {
      return next();
    }

    if (allowedRoles.includes(userRole)) {
      return next();
    }

    // Allow patient to view their own records
    if (userRole === 'patient') {
      const patientId = req.params.patientId || req.body.patientId || req.query.patientId || req.params.id;
      // We will check ownership inside the specific route or ownership check middleware
      if (patientId) return next();
    }

    return res.status(403).json({ error: `Access denied: Role '${userRole}' not permitted for this EMR action` });
  };
};

// Middleware to check Patient Consent under DPDP Act 2023
const checkPatientConsent = (purpose) => {
  return async (req, res, next) => {
    try {
      const patientId = req.params.patientId || req.body.patientId || req.query.patientId || req.params.id;
      if (!patientId) {
        return res.status(400).json({ error: 'Patient ID is required for consent validation' });
      }

      // Patients can always access their own records
      if (req.user?.role === 'patient') {
        return next();
      }

      // 1. Check if patient has a legal hold (bypasses deletion and always allows clinical review)
      const patient = await Patient.findById(patientId) || await Patient.findOne({ _id: patientId, tenantId: req.tenantId });
      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      // Check if doctor is using Emergency Override
      const isEmergencyBypass = req.headers['x-bypass-consent-emergency'] === 'true' && req.user?.role === 'doctor';

      // 2. Query consent record
      const consent = await Consent.findOne({ patientId, tenantId: req.tenantId });
      
      if (!consent) {
        // If no consent record is present, treat as Active for Treatment by default, but warn
        if (isEmergencyBypass) {
          await writeAudit(req, patientId, 'EMERGENCY_BYPASS_NO_CONSENT', 'Consent Registry', { purpose, reason: 'Emergency Medical Care' });
        }
        return next();
      }

      // 3. Verify consent status & purpose limitation
      const consentActive = consent.status === 'Active';
      const purposeAllowed = consent.purposes && consent.purposes[purpose];

      if (!consentActive || !purposeAllowed) {
        if (isEmergencyBypass) {
          await writeAudit(req, patientId, 'EMERGENCY_BYPASS_WITHDRAWN_CONSENT', 'Consent Registry', {
            purpose,
            reason: 'Emergency Medical Care Override',
            originalStatus: consent.status,
            originalPurposes: consent.purposes
          });
          return next();
        }

        // Access denied
        await writeAudit(req, patientId, 'CONSENT_DENIED', 'Consent Registry', { purpose, status: consent.status });
        return res.status(403).json({
          error: `Access Denied: Patient has withdrawn or restricted consent for purpose '${purpose}'.`,
          code: 'CONSENT_WITHDRAWN',
          patientName: patient.name
        });
      }

      next();
    } catch (error) {
      console.error('[CONSENT MIDDLEWARE ERROR]', error);
      res.status(500).json({ error: 'Internal compliance verification error' });
    }
  };
};

module.exports = {
  writeAudit,
  restrictEMRRole,
  checkPatientConsent
};
