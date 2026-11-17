const crypto = require('crypto');
const RefreshToken = require('../models/RefreshToken');

const getRefreshCookieName = () => {
  return process.env.AUTH_REFRESH_COOKIE_NAME || 'refreshToken';
};

const isProductionEnvironment = () => {
  return process.env.NODE_ENV === 'production' || !!process.env.RENDER || !!process.env.VERCEL;
};

/**
 * Returns cookie options for setting the refresh token.
 * Uses HttpOnly, Secure in production, and SameSite configuration.
 */
const getRefreshCookieOptions = () => {
  const isProd = isProductionEnvironment();
  const refreshDays = parseInt(process.env.AUTH_REFRESH_TOKEN_DAYS || '7', 10);
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: refreshDays * 24 * 60 * 60 * 1000
  };
};

/**
 * Returns cookie options for clearing the refresh token.
 */
const getClearRefreshCookieOptions = () => {
  const isProd = isProductionEnvironment();
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/api/auth'
  };
};

/**
 * Creates a new refresh session and attaches the HttpOnly cookie to the response.
 *
 * @param {Object} res - Express Response
 * @param {Object} options
 * @param {Object} options.user - User document / object
 * @param {string} options.tenantId - Tenant identifier
 * @param {string} [options.familyId] - Existing familyId if rotating
 * @param {Object} [options.req] - Express Request (to capture IP and User-Agent)
 * @returns {Promise<{ rawToken: string, session: Document }>}
 */
const issueRefreshSession = async (res, { user, tenantId, familyId = null, req = null }) => {
  const userAgent = req ? (req.headers['user-agent'] || '') : '';
  const ipAddress = req ? (req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '') : '';
  const passwordVersion = user.password_version || 0;

  const { rawToken, session } = await RefreshToken.createSession({
    userId: user._id,
    tenantId,
    familyId,
    userAgent,
    ipAddress,
    password_version: passwordVersion
  });

  const cookieName = getRefreshCookieName();
  res.cookie(cookieName, rawToken, getRefreshCookieOptions());

  return { rawToken, session };
};

/**
 * Revokes all active refresh sessions for a user (e.g. on password change).
 */
const revokeAllUserSessions = async (userId) => {
  if (!userId) return;
  await RefreshToken.updateMany(
    { userId, isRevoked: false },
    { $set: { isRevoked: true, revokedAt: new Date() } }
  );
};

// ══════════════════════════════════════════════════════════════════════════
// GLOBAL & HOSPITAL PATIENT PORTAL SESSION HELPERS (PHASE H / SESSION FIX)
// ══════════════════════════════════════════════════════════════════════════

const getPatientGlobalRefreshCookieName = () => {
  return process.env.PATIENT_GLOBAL_REFRESH_COOKIE_NAME || 'quroxa_patient_global_refresh';
};

const getPatientHospitalRefreshCookieName = () => {
  return process.env.PATIENT_HOSPITAL_REFRESH_COOKIE_NAME || 'quroxa_patient_hospital_refresh';
};

/**
 * Returns cookie options for patient refresh tokens.
 * Enforces HttpOnly, SameSite=None + Secure in production for cross-origin Render hosting,
 * or SameSite=Lax in local development.
 */
const getPatientCookieOptions = (path = '/api/auth') => {
  const isProd = isProductionEnvironment();
  const refreshDays = parseInt(process.env.AUTH_REFRESH_TOKEN_DAYS || '7', 10);
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path,
    maxAge: refreshDays * 24 * 60 * 60 * 1000
  };
};

/**
 * Returns clear-cookie options for patient refresh cookies.
 */
const getClearPatientCookieOptions = (path = '/api/auth') => {
  const isProd = isProductionEnvironment();
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path
  };
};

/**
 * Issues a server-side verified Global Patient refresh session (Scope A).
 */
const issuePatientGlobalRefreshSession = async (
  res,
  { patient, req = null, familyId = null, absoluteExpiresAt = null }
) => {
  const userAgent = req ? (req.headers['user-agent'] || '') : '';
  const ipAddress = req ? (req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '') : '';

  const { rawToken, session } = await RefreshToken.createSession({
    userId: patient._id,
    tenantId: 'global',
    familyId,
    sessionScope: 'global_patient',
    patientId: patient._id,
    absoluteExpiresAt,
    userAgent,
    ipAddress,
    password_version: 0
  });

  const cookieName = getPatientGlobalRefreshCookieName();
  res.cookie(cookieName, rawToken, getPatientCookieOptions('/api/auth'));

  return { rawToken, session };
};

/**
 * Issues a server-side verified Hospital Clinical refresh session (Scope B).
 */
const issuePatientHospitalRefreshSession = async (
  res,
  { user, patient, tenantId, req = null, familyId = null, absoluteExpiresAt = null }
) => {
  const userAgent = req ? (req.headers['user-agent'] || '') : '';
  const ipAddress = req ? (req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '') : '';

  const { rawToken, session } = await RefreshToken.createSession({
    userId: user._id,
    tenantId: String(tenantId).trim().toLowerCase(),
    familyId,
    sessionScope: 'hospital_patient',
    patientId: patient._id,
    absoluteExpiresAt,
    userAgent,
    ipAddress,
    password_version: 0
  });

  const cookieName = getPatientHospitalRefreshCookieName();
  res.cookie(cookieName, rawToken, getPatientCookieOptions('/api/auth'));

  return { rawToken, session };
};

/**
 * Clears the Global Patient refresh cookie from the browser.
 */
const clearPatientGlobalRefreshCookie = (res) => {
  const cookieName = getPatientGlobalRefreshCookieName();
  res.clearCookie(cookieName, getClearPatientCookieOptions('/api/auth'));
};

/**
 * Clears the Hospital Clinical refresh cookie from the browser.
 */
const clearPatientHospitalRefreshCookie = (res) => {
  const cookieName = getPatientHospitalRefreshCookieName();
  res.clearCookie(cookieName, getClearPatientCookieOptions('/api/auth'));
};

module.exports = {
  getRefreshCookieName,
  getRefreshCookieOptions,
  getClearRefreshCookieOptions,
  issueRefreshSession,
  revokeAllUserSessions,
  getPatientGlobalRefreshCookieName,
  getPatientHospitalRefreshCookieName,
  getPatientCookieOptions,
  getClearPatientCookieOptions,
  issuePatientGlobalRefreshSession,
  issuePatientHospitalRefreshSession,
  clearPatientGlobalRefreshCookie,
  clearPatientHospitalRefreshCookie
};
