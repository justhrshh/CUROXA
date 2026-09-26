const express = require('express');
const jwt = require('jsonwebtoken');
const RoleCoverage = require('../models/RoleCoverage');
const AuditLog = require('../models/AuditLog');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');
const router = express.Router();

// Define default permissions per role (must mirror pmModules in AdminDashboard.jsx)
const defaultPermissions = {
  admin: [
    'admin-dashboard', 'admin-staff', 'admin-inventory', 'admin-coverage', 'admin-approvals',
    'admin-audit', 'admin-reports', 'admin-billing'
  ],
  doctor: [
    'dr-consult', 'dr-rx', 'dr-laborder', 'dr-history', 'dr-discharge', 'dr-stockview'
  ],
  receptionist: [
    'rc-register', 'rc-appt', 'rc-queue', 'rc-upload', 'rc-billing', 'rc-reorder', 'rc-labprint'
  ],
  patient: [
    'pt-appointments', 'pt-prescriptions', 'pt-lab-reports', 'pt-billing'
  ],
  lab: [
    'lt-queue', 'lt-upload', 'lt-reagents', 'lt-dispatch', 'lt-extlab'
  ],
  pharmacy: [
    'ph-queue', 'ph-dispense', 'ph-stock', 'ph-reorder', 'ph-billing', 'ph-controlled', 'ph-itemmaster', 'ph-quotations'
  ],
  nurse: [
    'nu-vitals', 'nu-ward', 'nu-labassist', 'nu-dispense'
  ],
  hr: [
    'admin-staff', 'admin-approvals', 'admin-reports'
  ]
};

// Lightweight JWT extractor (doesn't require full middleware to keep endpoint snappy)
const { getJwtSecret } = require('../config/env');
const extractUser = (req) => {
  const auth = req.headers['authorization'];
  if (!auth) return null;
  const token = auth.split(' ')[1] || auth;
  try {
    return jwt.verify(token, getJwtSecret());
  } catch (e) {
    return null;
  }
};

// POST /api/permissions/grant — grant a permission to a staff member (admin only)
// SECURITY: tenantId and the actor identity come from the verified JWT, NEVER
// from the request body. Previously this endpoint was unauthenticated and read
// tenantId/staffId/permissionId entirely from req.body, so any anonymous caller
// could grant themselves any permission in any tenant.
router.post('/grant', verifyToken, isAdmin, async (req, res) => {
  try {
    // tenantId is bound to the admin's session; cannot be cross-tenant spoofed.
    const tenantId = req.user.tenantId || req.tenantId;
    // staffId here is the TARGET staff member being granted the permission
    // (a legit body input), distinct from the admin actor.
    const { staffId, permissionId, type, expiresIn, comment } = req.body;
    const actor = req.user.staff_id || req.user.id;
    const actorName = req.user.name || '';

    if (!staffId || typeof staffId !== 'string' || !permissionId || typeof permissionId !== 'string') {
      return res.status(400).json({ error: 'staffId and permissionId are required' });
    }

    let expiresAt = null;
    if (type === 'temp' && expiresIn) {
      expiresAt = new Date(Date.now() + expiresIn);
    }

    const doc = await RoleCoverage.findOneAndUpdate(
      { tenantId },
      {
        $set: {
          [`state.${staffId}.${permissionId}`]: {
            on: true,
            type: type || 'permanent',
            expiresAt: expiresAt ? expiresAt.toISOString() : null,
            grantedAt: new Date().toISOString(),
            grantedBy: actor
          }
        }
      },
      { returnDocument: 'after', upsert: true }
    );

    await AuditLog.create({
      tenantId,
      actor: actor,
      actorName: actorName,
      actorRole: 'admin',
      action: 'permission_granted',
      target: `${staffId}:${permissionId}`,
      metadata: { type, expiresAt, comment, permissionId }
    });

    const io = req.app.get("io");
    if (io && tenantId) {
      io.to(tenantId).emit("data_changed", { type: "coverage" });
    }
    res.json({ success: true, state: doc.state });
  } catch (err) {
    console.error('permission grant error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/permissions/revoke — revoke a permission from a staff member (admin only)
router.post('/revoke', verifyToken, isAdmin, async (req, res) => {
  try {
    const tenantId = req.user.tenantId || req.tenantId;
    const { staffId, permissionId, comment } = req.body;
    const actor = req.user.staff_id || req.user.id;
    const actorName = req.user.name || '';

    if (!staffId || typeof staffId !== 'string' || !permissionId || typeof permissionId !== 'string') {
      return res.status(400).json({ error: 'staffId and permissionId are required' });
    }

    const doc = await RoleCoverage.findOneAndUpdate(
      { tenantId },
      {
        $unset: {
          [`state.${staffId}.${permissionId}`]: ''
        }
      },
      { returnDocument: 'after' }
    );

    await AuditLog.create({
      tenantId,
      actor: actor,
      actorName: actorName,
      actorRole: 'admin',
      action: 'permission_revoked',
      target: `${staffId}:${permissionId}`,
      metadata: { comment, permissionId }
    });

    const io = req.app.get("io");
    if (io && tenantId) {
      io.to(tenantId).emit("data_changed", { type: "coverage" });
    }
    res.json({ success: true, state: doc ? doc.state : {} });
  } catch (err) {
    console.error('permission revoke error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/permissions/me — effective permissions for the logged-in user
router.get('/me', async (req, res) => {
  const user = extractUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const tenantId = user.tenantId || 'city_hospital';
  const role = user.role || 'patient';
  const staffId = user.staff_id || user.id;

  // Start with role defaults
  const basePerms = new Set(defaultPermissions[role] || []);

  // Layer in role coverage grants (still active and not expired)
  try {
    const doc = await RoleCoverage.findOne({ tenantId });
    if (doc && doc.state) {
      const now = new Date();
      // state is keyed by staffId -> { permissionId: { on, type, expiresAt } }
      const userGrants = doc.state[staffId] || {};
      Object.keys(userGrants).forEach(permId => {
        const grant = userGrants[permId];
        if (grant && grant.on) {
          if (grant.type === 'temp' && grant.expiresAt) {
            if (new Date(grant.expiresAt) > now) basePerms.add(permId);
          } else if (grant.type === 'permanent') {
            basePerms.add(permId);
          }
        }
      });
    }
  } catch (e) {
    // best-effort — return defaults if coverage lookup fails
  }

  res.json({
    role,
    staffId,
    tenantId,
    permissions: Array.from(basePerms),
    grants: []
  });
});

module.exports = router;
