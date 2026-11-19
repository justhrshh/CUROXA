const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken, isSuperAdmin } = require('../middleware/authMiddleware');
const { storageService } = require('../services/storage/storageService');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

const SUPER_ADMIN_ROLES = new Set(['superadmin', 'super_admin', 'platform_admin']);
const AUTHORIZED_STAFF_ROLES = new Set(['doctor', 'receptionist', 'admin', 'pharmacist', 'hr', 'hr_manager', 'lab_technician']);

/**
 * Validates tenant isolation on storage key access.
 */
function validateTenantAccess(user, key) {
  if (!key || typeof key !== 'string') return false;
  const isSuper = Boolean(user.role && SUPER_ADMIN_ROLES.has(user.role));
  if (isSuper) return true;

  // Extract tenantId from pattern: tenants/{tenantId}/... or public/{tenantId}/...
  const match = key.match(/^(?:tenants|public)\/([^\/]+)\//i);
  if (!match) return true; // generic or un-tenanted keys

  const keyTenant = match[1].toLowerCase().trim();
  const userTenant = (user.tenantId || '').toLowerCase().trim();

  return keyTenant === userTenant;
}

/**
 * GET /api/storage/signed-url
 * Generates a short-lived presigned URL for downloading a private document.
 * Enforces strict authentication, tenant isolation, and RBAC / patient ownership.
 */
router.get('/signed-url', verifyToken, async (req, res) => {
  try {
    const { key, isPrivate = 'true' } = req.query;
    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'Valid storage key is required.' });
    }

    // 1. Tenant boundary enforcement
    if (!validateTenantAccess(req.user, key)) {
      return res.status(403).json({
        error: 'Access denied: Cross-tenant document access is prohibited.',
        code: 'FORBIDDEN_TENANT_MISMATCH'
      });
    }

    // 2. Patient role ownership check for confidential patient documents
    if (req.user.role === 'patient') {
      const isPrescriptionKey = key.includes('/prescriptions/');
      const isClinicalDocKey = key.includes('/clinical-documents/');

      if (isPrescriptionKey) {
        // Verify patient ownership of the prescription
        const rx = await Prescription.findOne({
          $or: [
            { 'images.url': key },
            { 'images.url': { $regex: key.split('/').pop(), $options: 'i' } }
          ]
        }).select('patientId tenantId');

        if (rx) {
          const patientUser = await Patient.findById(rx.patientId).select('_id contact email');
          const userId = (req.user.id || req.user._id || '').toString();
          const isOwner = (patientUser && patientUser._id.toString() === userId) ||
            (rx.patientId && rx.patientId.toString() === userId);

          if (!isOwner) {
            return res.status(403).json({
              error: 'Access denied: You can only access your own prescription documents.',
              code: 'FORBIDDEN_NOT_OWNER'
            });
          }
        }
      }
    }

    const privateFlag = isPrivate !== 'false';
    const presignedUrl = await storageService.createPresignedDownloadUrl({
      key,
      isPrivate: privateFlag,
      expiresInSeconds: 900 // 15 minutes
    });

    res.json({
      success: true,
      url: presignedUrl,
      expiresIn: 900
    });
  } catch (err) {
    console.error('[STORAGE ROUTE] Signed URL error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate signed download URL.' });
  }
});

/**
 * GET /api/storage/stream
 * Authenticated streaming endpoint for private documents.
 */
router.get('/stream', verifyToken, async (req, res) => {
  try {
    const { key, isPrivate = 'true' } = req.query;
    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'Valid storage key is required.' });
    }

    if (!validateTenantAccess(req.user, key)) {
      return res.status(403).json({
        error: 'Access denied: Cross-tenant document access is prohibited.',
        code: 'FORBIDDEN_TENANT_MISMATCH'
      });
    }

    const privateFlag = isPrivate !== 'false';
    const download = await storageService.downloadBuffer({
      key,
      isPrivate: privateFlag
    });

    res.setHeader('Content-Type', download.contentType || 'application/octet-stream');
    res.setHeader('Content-Length', download.contentLength);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(download.buffer);
  } catch (err) {
    console.error('[STORAGE ROUTE] Stream error:', err);
    res.status(err.code === 'NoSuchKey' ? 404 : 500).json({ error: err.message || 'Failed to stream document.' });
  }
});

/**
 * POST /api/storage/upload-private
 * Authenticated upload for confidential medical and staff documents.
 */
router.post('/upload-private', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const category = req.body.category || 'documents';
    const tenantId = req.user.role && SUPER_ADMIN_ROLES.has(req.user.role)
      ? (req.body.tenantId || req.tenantId || 'global')
      : (req.tenantId || req.user.tenantId || 'default');

    const result = await storageService.uploadPrivate({
      tenantId,
      category,
      buffer: req.file.buffer,
      mimetype: req.file.mimetype,
      originalName: req.file.originalname,
      metadata: {
        uploadedBy: (req.user.id || req.user._id || '').toString(),
        uploadedByRole: req.user.role || 'staff'
      }
    });

    res.status(201).json({
      success: true,
      key: result.key,
      bucket: result.bucket,
      size: result.size,
      checksum: result.checksum,
      isPrivate: true
    });
  } catch (err) {
    console.error('[STORAGE ROUTE] Upload error:', err);
    res.status(500).json({ error: err.message || 'Private document upload failed.' });
  }
});

module.exports = router;
