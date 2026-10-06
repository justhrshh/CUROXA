const express = require('express');
const router = express.Router();
const SuperAdminHospital = require('../models/SuperAdminHospital');

/**
 * Resolves hospital branding metadata for currently active tenant (by code or hospitalId).
 */
router.get('/tenant/current', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenantId;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant ID required' });
    }

    const hospital = await SuperAdminHospital.findOne({
      $or: [
        { code: tenantId },
        { hospitalId: String(tenantId).toUpperCase() }
      ]
    }).select('hospitalId code name logo address phone gst status -_id').lean();

    if (!hospital) {
      return res.status(404).json({ error: 'Hospital not found' });
    }

    return res.json({
      hospitalId: hospital.hospitalId,
      code: hospital.code,
      name: hospital.name,
      logo: hospital.logo || '',
      address: hospital.address || '',
      phone: hospital.phone || '',
      gst: hospital.gst || '',
      status: hospital.status || 'Active'
    });
  } catch (err) {
    console.error('[TENANT_BRANDING_ERROR]:', err);
    return res.status(500).json({ error: 'Internal server error resolving tenant portal' });
  }
});

/**
 * Public branding endpoint for Hospital Portal.
 * Resolves ONLY by indexed, unique hospitalId (e.g. HSP-8F42K7).
 * Returns strictly public branding metadata: { hospitalId, name, logo, status }.
 * Omits ALL sensitive fields (_id, passwords, admin info, financial, limits, modules).
 */
router.get('/:hospitalId', async (req, res) => {
  try {
    const rawHospitalId = String(req.params.hospitalId || '').trim().toUpperCase();

    // Strict format check before hitting database
    if (!/^HSP-[A-Z0-9]{6}$/.test(rawHospitalId)) {
      return res.status(404).json({ error: 'Hospital portal not found' });
    }

    const hospital = await SuperAdminHospital.findOne(
      { hospitalId: rawHospitalId }
    ).select('hospitalId name logo status -_id').lean();

    if (!hospital) {
      return res.status(404).json({ error: 'Hospital portal not found' });
    }

    // Explicit projection guaranteeing no unintended fields leak
    return res.json({
      hospitalId: hospital.hospitalId,
      name: hospital.name,
      logo: hospital.logo || '',
      status: hospital.status || 'Active'
    });
  } catch (err) {
    console.error('[PORTAL_BRANDING_ERROR]:', err);
    return res.status(500).json({ error: 'Internal server error resolving hospital portal' });
  }
});

module.exports = router;
