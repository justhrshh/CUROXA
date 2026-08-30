const SuperAdminHospital = require('../models/SuperAdminHospital');
const User = require('../models/User');

const checkModule = (moduleName) => {
  return async (req, res, next) => {
    try {
      // 1. Super Admin has unrestricted global access
      if (req.user && (req.user.role === 'superadmin' || req.user.role === 'super_admin')) {
        return next();
      }

      // 2. Patients accessing their own records bypass subscription checks
      if (req.user && req.user.role === 'patient') {
        return next();
      }

      const tenantId = req.tenantId || 'city_hospital';

      // 2. Fetch hospital plan settings
      const hospital = await SuperAdminHospital.findOne({ code: tenantId });
      if (!hospital) {
        // Backwards compatibility for dev/seeding or if no hospital profile exists yet
        return next();
      }

      // 3. Check suspension status
      if (hospital.status !== 'Active') {
        return res.status(403).json({
          error: `Access denied. The subscription for hospital '${hospital.name}' is currently ${hospital.status}. Please contact support.`
        });
      }

      // Check Trial Plan (custom) automatic 1-week expiration
      if (hospital.subscriptionPlan === 'custom') {
        const registrationDate = new Date(hospital.createdAt);
        const daysElapsed = (Date.now() - registrationDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysElapsed > 7) {
          return res.status(403).json({
            error: `Access denied. Your 1-week Trial subscription has expired. Please contact sales to upgrade your plan.`
          });
        }
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

module.exports = {
  checkModule
};
