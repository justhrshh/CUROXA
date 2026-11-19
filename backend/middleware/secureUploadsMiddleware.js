/**
 * Secure Uploads Middleware
 * Intercepts requests to /uploads to protect confidential medical documents.
 * 
 * Enforced Business Permissions:
 * 1. RECEPTIONIST:
 *    - Can access prescriptions belonging to every patient within their own hospital.
 *    - Cannot access prescriptions belonging to another hospital.
 *    - Not restricted by treatingDoctorId.
 * 2. DOCTOR:
 *    - Can access prescriptions belonging to every patient within their own hospital.
 *    - Access is not restricted to patients assigned to that particular doctor.
 *    - Cannot access another hospital's prescriptions.
 * 3. PATIENT:
 *    - Can access their own prescriptions only.
 *    - Verified using actual Patient database record and its relationship to the authenticated user.
 *    - Cannot access another patient's prescriptions, even within the same hospital.
 * 4. SUPER ADMINISTRATOR:
 *    - Can access prescriptions across hospitals.
 *    - Must be authenticated and verified as an authorized super administrator.
 *    - Cross-tenant access is explicitly permitted.
 * 5. ALL OTHER ROLES:
 *    - Denied access unless explicitly authorized by existing policy (e.g. pharmacist/admin in same hospital).
 */

const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/env');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');

// Staff roles authorized for tenant-scoped prescription access
const AUTHORIZED_STAFF_ROLES = new Set(['doctor', 'receptionist', 'admin', 'pharmacist']);
const SUPER_ADMIN_ROLES = new Set(['superadmin', 'super_admin', 'platform_admin']);

/**
 * Escapes characters for safe RegExp construction.
 * @param {string} str 
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts and verifies JWT from Authorization header or cookie.
 * @param {Object} req 
 * @returns {Object|null} Decoded token payload or null
 */
function authenticateToken(req) {
  let token = null;

  const authHeader = req.headers['authorization'];
  if (authHeader && typeof authHeader === 'string') {
    const parts = authHeader.trim().split(' ');
    token = parts.length === 2 && /^bearer$/i.test(parts[0]) ? parts[1] : parts[0];
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) return null;

  let secret;
  try {
    secret = getJwtSecret();
  } catch (e) {
    secret = process.env.JWT_SECRET || 'secret_key';
  }

  try {
    return jwt.verify(token, secret);
  } catch (err) {
    return null;
  }
}

/**
 * Verifies patient ownership using the actual database Patient record and its relationship to the authenticated user.
 * @param {Object} decoded - Decoded JWT payload
 * @param {Object|string} patientIdRef - Patient ID or populated Patient object from Prescription
 * @returns {Promise<boolean>}
 */
async function verifyPatientOwnership(decoded, patientIdRef) {
  if (!patientIdRef) return false;

  const targetPatientId = (patientIdRef._id || patientIdRef).toString();
  const userId = (decoded.id || decoded.userId || decoded._id || '').toString();

  // If user token matches target patient ID directly
  const matchesDirectId = (targetPatientId === userId || targetPatientId === (decoded.patientId || '').toString());

  try {
    const patientRecord = await Patient.findById(targetPatientId).select('_id contact email tenantId');
    if (!patientRecord) {
      return false;
    }

    const patientDbId = patientRecord._id.toString();
    const tokenPhone = decoded.phone ? String(decoded.phone).trim() : null;
    const tokenEmail = decoded.email ? String(decoded.email).toLowerCase().trim() : null;
    const patientContact = patientRecord.contact ? String(patientRecord.contact).trim() : null;
    const patientEmail = patientRecord.email ? String(patientRecord.email).toLowerCase().trim() : null;

    // Check primary database ID match
    if (patientDbId === userId) return true;
    if (matchesDirectId) return true;

    // Verify phone relationship (Indian 10-digit comparison)
    if (tokenPhone && patientContact) {
      const cleanTokenPhone = tokenPhone.replace(/\D/g, '').slice(-10);
      const cleanPatientContact = patientContact.replace(/\D/g, '').slice(-10);
      if (cleanTokenPhone.length === 10 && cleanTokenPhone === cleanPatientContact) {
        return true;
      }
    }

    // Verify email relationship
    if (tokenEmail && patientEmail && patientEmail !== 'n/a' && patientEmail === tokenEmail) {
      return true;
    }

    return false;
  } catch (err) {
    console.error('[SecureUploadsMiddleware] Patient verification lookup error:', err);
    return false;
  }
}

/**
 * Express middleware for securing /uploads
 */
async function secureUploadsMiddleware(req, res, next) {
  try {
    const normalizedPath = req.path.replace(/\\/g, '/');
    const isPrescriptionRequest = normalizedPath.startsWith('/prescriptions/') || normalizedPath === '/prescriptions';

    // -------------------------------------------------------------
    // Handling Non-Prescription Files (Public assets like logos)
    // -------------------------------------------------------------
    if (!isPrescriptionRequest) {
      const safeSubpath = normalizedPath.replace(/^\/+/, '');
      const uploadsDir = path.resolve(__dirname, '../uploads');
      const targetPath = path.resolve(uploadsDir, safeSubpath);

      // Path traversal protection
      if (!targetPath.startsWith(uploadsDir)) {
        return res.status(403).json({ error: 'Access denied: Invalid file path.' });
      }

      if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
        return res.status(404).json({ error: 'File not found.' });
      }

      return res.sendFile(targetPath);
    }

    // -------------------------------------------------------------
    // Handling Confidential Prescription Files
    // -------------------------------------------------------------
    const filename = path.basename(normalizedPath);
    if (!filename || filename === 'prescriptions') {
      return res.status(400).json({ error: 'Filename is required.' });
    }

    // Prevent directory traversal characters in filename
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename.' });
    }

    // 1. Authenticate Request (strictly via header or cookie; no query parameters)
    const decoded = authenticateToken(req);
    if (!decoded) {
      return res.status(401).json({
        error: 'Authentication required to access confidential prescription documents.',
        code: 'UNAUTHORIZED'
      });
    }

    const isSuperAdmin = Boolean(decoded.role && SUPER_ADMIN_ROLES.has(decoded.role));
    const tokenTenant = (decoded.tenantId || '').toLowerCase().trim();

    // 2. Resolve Database Document
    const escapedName = escapeRegex(filename);
    const prescription = await Prescription.findOne({
      $or: [
        { 'images.url': { $regex: new RegExp(`${escapedName}$`, 'i') } },
        { 'images.url': filename }
      ]
    }).select('tenantId patientId doctorId images');

    if (!prescription) {
      return res.status(404).json({
        error: 'Prescription document record not found.',
        code: 'NOT_FOUND'
      });
    }

    const docTenant = (prescription.tenantId || '').toLowerCase().trim();

    // 3. Super Administrator: Cross-tenant access explicitly permitted
    if (isSuperAdmin) {
      return await servePrescriptionFile(filename, res, prescription);
    }

    // 4. Tenant Boundary Enforcement for all hospital-scoped users
    if (tokenTenant !== docTenant) {
      return res.status(403).json({
        error: 'Access denied: Cross-tenant document access is prohibited.',
        code: 'FORBIDDEN_TENANT_MISMATCH'
      });
    }

    // 5. Patient Access: strictly verify ownership via database record
    if (decoded.role === 'patient' || decoded.isNewPatient) {
      const isOwner = await verifyPatientOwnership(decoded, prescription.patientId);
      if (!isOwner) {
        return res.status(403).json({
          error: 'Access denied: You can only access your own prescription documents.',
          code: 'FORBIDDEN_NOT_OWNER'
        });
      }
      return await servePrescriptionFile(filename, res, prescription);
    }

    // 6. Hospital Staff (Doctors, Receptionists, Admins):
    //    - Doctor: Can access prescriptions belonging to every patient within their hospital.
    //      Access is not restricted to patients assigned to that doctor (no treatingDoctorId restriction).
    //    - Receptionist: Can access prescriptions belonging to every patient within their hospital.
    //      Not restricted by treatingDoctorId.
    if (decoded.role && AUTHORIZED_STAFF_ROLES.has(decoded.role)) {
      return await servePrescriptionFile(filename, res, prescription);
    }

    // 7. All Other Roles: Deny access
    return res.status(403).json({
      error: 'Access denied: You do not have permission to view prescription documents.',
      code: 'FORBIDDEN'
    });

  } catch (error) {
    console.error('[SecureUploadsMiddleware] Error processing file request:', error);
    return res.status(500).json({ error: 'Internal server error processing document request.' });
  }
}

/**
 * Serves the verified prescription image file from local disk or Cloudflare R2 private bucket.
 * @param {string} filename 
 * @param {Object} res 
 * @param {Object} [prescriptionDoc]
 */
async function servePrescriptionFile(filename, res, prescriptionDoc) {
  const prescriptionsDir = path.resolve(__dirname, '../uploads/prescriptions');
  const filePath = path.resolve(prescriptionsDir, filename);

  if (filePath.startsWith(prescriptionsDir) && fs.existsSync(filePath)) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res.sendFile(filePath);
  }

  // If local file does not exist or driver is R2, attempt resolution from R2 private vault
  try {
    const { storageService } = require('../services/storage/storageService');
    let targetKey = '';

    if (prescriptionDoc && Array.isArray(prescriptionDoc.images)) {
      const matched = prescriptionDoc.images.find(img => img.url && (img.url.endsWith(filename) || img.url.includes(filename)));
      if (matched && matched.url) {
        targetKey = matched.url;
      }
    }

    if (!targetKey && prescriptionDoc?.tenantId) {
      targetKey = `tenants/${prescriptionDoc.tenantId}/prescriptions/${filename}`;
    }

    if (targetKey && !targetKey.startsWith('data:') && !targetKey.startsWith('http://') && !targetKey.startsWith('https://')) {
      const presignedUrl = await storageService.createPresignedDownloadUrl({
        key: targetKey,
        isPrivate: true,
        expiresInSeconds: 900
      });
      return res.redirect(presignedUrl);
    }
  } catch (r2Err) {
    console.warn('[SECURE_UPLOADS] R2 resolution notice:', r2Err.message);
  }

  return res.status(404).json({
    error: 'Prescription image file not found on disk or storage vault.',
    code: 'FILE_NOT_FOUND'
  });
}

module.exports = secureUploadsMiddleware;
