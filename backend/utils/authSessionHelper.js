const crypto = require('crypto');
const RefreshToken = require('../models/RefreshToken');

const getRefreshCookieName = () => {
  return process.env.AUTH_REFRESH_COOKIE_NAME || 'refreshToken';
};

/**
 * Returns cookie options for setting the refresh token.
 * Uses HttpOnly, Secure in production, and SameSite configuration.
 */
const getRefreshCookieOptions = () => {
  const isProd = process.env.NODE_ENV === 'production';
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
  const isProd = process.env.NODE_ENV === 'production';
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

module.exports = {
  getRefreshCookieName,
  getRefreshCookieOptions,
  getClearRefreshCookieOptions,
  issueRefreshSession,
  revokeAllUserSessions
};
