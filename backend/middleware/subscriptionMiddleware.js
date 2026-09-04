const SuperAdminHospital = require('../models/SuperAdminHospital');
const User = require('../models/User');
const { getHospitalSubscriptionStatus } = require('../utils/subscriptionHelper');

const checkModule = (moduleName) => {
  return async (req, res, next) => {
    try {
      // Fallback decode if checkModule precedes route-level verifyToken
      if (!req.user && req.headers && req.headers.authorization) {
        try {
          const jwt = require('jsonwebtoken');
          const { getJwtSecret } = require('../config/env');
          const token = req.headers.authorization.split(' ')[1];
          const decoded = jwt.verify(token, getJwtSecret());
          if (decoded) req.user = decoded;
        } catch (e) {}
      }

      // 1. Super Admin has unrestricted global access
      if (req.user && ['superadmin', 'super_admin', 'platform_admin'].includes(String(req.user.role || '').toLowerCase())) {
        return next();
      }

      const tenantId = req.tenantId || 'city_hospital';

      // 2. Fetch hospital plan settings
      const hospital = await SuperAdminHospital.findOne({
        $or: [
          { code: String(tenantId).toLowerCase() },
          { hospitalId: String(tenantId).toUpperCase() }
        ]
      });
      if (!hospital) {
        // Backwards compatibility for dev/seeding or if no hospital profile exists yet
        return next();
      }

      // 3. Strict subscription expiry & suspension enforcement
      const subStatus = getHospitalSubscriptionStatus(hospital);
      if (subStatus.isExpired) {
        return res.status(403).json({
          error: "Your subscription has expired. Please contact your hospital administrator to renew your plan."
        });
      }

      // 4. Patients accessing their own records bypass specific module capability checks
      if (req.user && req.user.role === 'patient') {
        return next();
      }

      // 4. Validate module access
      const modulesToCheck = Array.isArray(moduleName) ? moduleName : [moduleName];
      const hasAccess = modulesToCheck.some(mod => hospital.modules && hospital.modules[mod] && hospital.modules[mod].enabled);
      if (!hasAccess) {
        return res.status(403).json({
          error: `Access Denied. None of the required modules (${modulesToCheck.join(', ').toUpperCase()}) are enabled for your hospital's subscription plan.`
        });
      }

      next();
    } catch (err) {
      console.error('Subscription middleware error:', err);
      res.status(500).json({ error: 'Internal server subscription check error' });
    }
  };
};

const checkDoctorClinicalMode = async (req, res, next) => {
  try {
    // Only restrict clinical access if the authenticated actor is a doctor
    if (!req.user || req.user.role !== 'doctor') {
      return next();
    }

    const tenantId = req.tenantId || (req.user && req.user.tenantId) || 'city_hospital';
    const hospital = await SuperAdminHospital.findOne({ code: tenantId });

    if (hospital && hospital.doctorClinicalMode === 'OFFLINE') {
      return res.status(403).json({
        error: 'DOCTOR_CLINICAL_MODE_OFFLINE',
        message: 'Doctor clinical access is disabled for this hospital.'
      });
    }

    next();
  } catch (err) {
    console.error('checkDoctorClinicalMode error:', err);
    res.status(500).json({ error: 'Internal server error checking doctor clinical mode' });
  }
};

const requireActiveSubscription = async (req, res, next) => {
  try {
    if (!req.user && req.headers && req.headers.authorization) {
      try {
        const jwt = require('jsonwebtoken');
        const { getJwtSecret } = require('../config/env');
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, getJwtSecret());
        if (decoded) req.user = decoded;
      } catch (e) {}
    }

    if (req.user && ['superadmin', 'super_admin', 'platform_admin'].includes(String(req.user.role || '').toLowerCase())) {
      return next();
    }
    const tenantId = req.tenantId || (req.user && req.user.tenantId) || 'city_hospital';
    const hospital = await SuperAdminHospital.findOne({
      $or: [
        { code: String(tenantId).toLowerCase() },
        { hospitalId: String(tenantId).toUpperCase() }
      ]
    });
    if (!hospital) return next();

    const subStatus = getHospitalSubscriptionStatus(hospital);
    if (subStatus.isExpired) {
      return res.status(403).json({
        error: "Your subscription has expired. Please contact your hospital administrator to renew your plan."
      });
    }
    next();
  } catch (err) {
    console.error('requireActiveSubscription error:', err);
    res.status(500).json({ error: 'Internal server error checking subscription' });
  }
};

module.exports = {
  checkModule,
  checkDoctorClinicalMode,
  requireActiveSubscription
};

