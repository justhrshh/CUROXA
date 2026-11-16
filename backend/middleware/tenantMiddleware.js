/**
 * Tenant Middleware for Curoxa SaaS
 * Resolves the active tenant (hospital) for the request context
 */
const tenantMiddleware = (req, res, next) => {
  // 1. If user is authenticated and has a tenantId, enforce it from their verified token
  if (req.user && req.user.tenantId) {
    req.tenantId = req.user.tenantId;
    return next();
  }

  // 2. Otherwise, check request headers, body, or query string parameters (for login/signup)
  let tenantId = req.headers['x-tenant-id'] || req.body?.tenantId || req.body?.hospitalId || req.query?.tenantId;

  // 3. Normalize tenant ID (trim whitespace, lowercase)
  if (tenantId && typeof tenantId === 'string') {
    tenantId = tenantId.trim().toLowerCase();
  }

  // 4. Set the resolved tenantId (no silent default for unauthenticated/portal requests)
  req.tenantId = tenantId || null;

  next();
};

module.exports = tenantMiddleware;
