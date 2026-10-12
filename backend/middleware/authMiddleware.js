const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getJwtSecret } = require('../config/env');

const verifyToken = (req, res, next) => {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  const tokenString = token.split(' ')[1] || token;

  let secret;
  try {
    secret = getJwtSecret();
  } catch (e) {
    secret = process.env.JWT_SECRET || 'secret_key';
  }

  jwt.verify(tokenString, secret, async (err, decoded) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token expired. Please re-authenticate.', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ error: 'Unauthorized', code: 'INVALID_TOKEN' });
    }
    
    // Check if the hospital tenant account is suspended (superadmins bypass this)
    const isSuperAdminRole = decoded && (decoded.role === 'superadmin' || decoded.role === 'super_admin' || decoded.role === 'platform_admin');
    if (decoded && decoded.tenantId && decoded.tenantId !== 'curoxa' && !isSuperAdminRole) {
      try {
        const SuperAdminHospital = require('../models/SuperAdminHospital');
        const hospital = await SuperAdminHospital.findOne({
          code: String(decoded.tenantId).toLowerCase().trim()
        }).select('status name');
        if (hospital && hospital.status === 'Suspended') {
          return res.status(403).json({
            error: `Hospital account (${hospital.name || decoded.tenantId}) is suspended. Access denied.`,
            code: 'ACCOUNT_SUSPENDED'
          });
        }
      } catch (hospErr) {
        console.warn('[AUTH] Tenant suspension check warning:', hospErr.message);
      }
    }

    // Patient tokens (from patient portal or registered patients)
    if (decoded && (decoded.role === 'patient' || decoded.isNewPatient)) {
      req.user = decoded;
      req.tenantId = decoded.tenantId || 'city_hospital';
      return next();
    }

    // For staff members, optionally validate user existence
    if (decoded && decoded.role !== 'superadmin' && decoded.role !== 'super_admin' && decoded.role !== 'platform_admin') {
      try {
        let user = null;
        if (decoded.userId || decoded.id) {
          user = await User.findById(decoded.userId || decoded.id).select('+password_hash password_version');
        }
        if (!user && decoded.staff_id) {
          user = await User.findOne({ staff_id: decoded.staff_id }).select('+password_hash password_version');
        }

        if (user) {
          // If password version is explicitly tracked on both token and DB
          if (
            decoded.password_version !== undefined && 
            user.password_version !== undefined && 
            user.password_version > 0 &&
            decoded.password_version !== user.password_version
          ) {
            return res.status(401).json({ error: 'Password changed' });
          }
        }
      } catch (dbErr) {
        console.warn('[AUTH] Token verification warning:', dbErr.message);
      }
    }
    
    req.user = decoded;
    req.tenantId = decoded.tenantId || 'city_hospital';
    next();
  });
};

const isAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Require Admin Role' });
  }
};

const isSuperAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'superadmin' || req.user.role === 'super_admin' || req.user.role === 'platform_admin')) {
    next();
  } else {
    res.status(403).json({ error: 'Require Super Admin Role' });
  }
};

const isHrOrAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'hr')) {
    next();
  } else {
    res.status(403).json({ error: 'Require Admin or HR Role' });
  }
};

module.exports = { verifyToken, isAdmin, isSuperAdmin, isHrOrAdmin };