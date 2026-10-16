/**
 * Centralized Application URL and Public Asset Helper for Quroxa Healthcare
 *
 * Manages environment-aware public origins and resolves absolute, email-safe
 * asset URLs across development and production environments.
 */

const CANONICAL_LOGO_FILENAME = 'quroxa_new_logo.png';

/**
 * Extracts and normalizes the list of explicitly trusted origins from server environment configuration.
 * @returns {Set<string>}
 */
function getTrustedOrigins() {
  const trusted = new Set();
  const addCandidate = (val) => {
    if (!val || typeof val !== 'string') return;
    val.split(',').forEach(item => {
      const clean = item.trim().replace(/\/+$/, '');
      if (clean && clean !== '*' && clean !== 'true') {
        trusted.add(clean.toLowerCase());
      }
    });
  };

  addCandidate(process.env.PUBLIC_APP_URL);
  addCandidate(process.env.FRONTEND_URL);
  addCandidate(process.env.CLIENT_URL);
  addCandidate(process.env.APP_URL);
  addCandidate(process.env.CORS_ORIGIN);
  addCandidate(process.env.RENDER_EXTERNAL_URL);
  addCandidate(process.env.DEPLOYED_URL);

  if (process.env.DOMAIN && typeof process.env.DOMAIN === 'string' && process.env.DOMAIN.trim()) {
    const d = process.env.DOMAIN.trim().replace(/\/+$/, '');
    addCandidate(d.startsWith('http://') || d.startsWith('https://') ? d : `https://${d}`);
  }

  return trusted;
}

/**
 * Extracts candidate origin from an incoming HTTP request.
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function extractRequestOrigin(req) {
  if (!req) return null;

  const origin = req.get ? req.get('origin') : (req.headers && req.headers.origin);
  if (origin && typeof origin === 'string') {
    return origin.trim().replace(/\/+$/, '');
  }

  const referer = req.get ? req.get('referer') : (req.headers && req.headers.referer);
  if (referer && typeof referer === 'string') {
    try {
      const refUrl = new URL(referer);
      return refUrl.origin.trim().replace(/\/+$/, '');
    } catch (_) {}
  }

  const fwdHost = req.headers && req.headers['x-forwarded-host'];
  if (fwdHost && typeof fwdHost === 'string') {
    const proto = (req.headers && req.headers['x-forwarded-proto']) || (req.secure ? 'https' : 'http');
    return `${proto}://${fwdHost.split(',')[0].trim()}`.replace(/\/+$/, '');
  }

  const host = req.get ? req.get('host') : (req.headers && req.headers.host);
  if (host && typeof host === 'string') {
    const proto = (req.headers && req.headers['x-forwarded-proto']) || (req.secure ? 'https' : 'http');
    return `${proto}://${host.trim()}`.replace(/\/+$/, '');
  }

  return null;
}

/**
 * Resolves the centralized public application base URL for backend-generated links
 * (password resets, OTP verification, invitations, email notifications, portal redirects).
 *
 * Security & Deployment Guarantee:
 * - Checks explicitly configured environment variables (PUBLIC_APP_URL, FRONTEND_URL, etc.)
 * - Only trusts request headers (Origin/Host) if they match trusted configuration or dev localhost
 * - Never uses localhost as a production fallback
 *
 * @param {import('express').Request} [req]
 * @returns {string} Fully qualified base URL (e.g. "https://app.yourdomain.com")
 */
function getPublicAppUrl(req) {
  const isProd = process.env.NODE_ENV === 'production';
  const trustedOrigins = getTrustedOrigins();

  // 1. Explicit PUBLIC_APP_URL override (forces exact domain when specified)
  if (process.env.PUBLIC_APP_URL && typeof process.env.PUBLIC_APP_URL === 'string' && process.env.PUBLIC_APP_URL.trim()) {
    return process.env.PUBLIC_APP_URL.trim().replace(/\/+$/, '');
  }

  // 2. Request-derived origin validation (honors trusted host; prevents host header poisoning)
  if (req) {
    const candidateReqOrigin = extractRequestOrigin(req);
    if (candidateReqOrigin) {
      const lower = candidateReqOrigin.toLowerCase();
      const isLocalhost = lower.includes('localhost') || lower.includes('127.0.0.1');

      if (!isProd && isLocalhost) {
        return candidateReqOrigin;
      }

      if (trustedOrigins.has(lower)) {
        return candidateReqOrigin;
      } else if (isProd) {
        console.warn(`[URL SECURITY] Untrusted request origin "${candidateReqOrigin}" rejected for link generation.`);
      }
    }
  }

  // 3. Explicit canonical frontend environment variables
  const envCandidates = [
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL,
    process.env.APP_URL,
    process.env.DEPLOYED_URL,
    process.env.RENDER_EXTERNAL_URL
  ];

  for (const candidate of envCandidates) {
    if (candidate && typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().replace(/\/+$/, '');
    }
  }

  if (process.env.DOMAIN && typeof process.env.DOMAIN === 'string' && process.env.DOMAIN.trim()) {
    const d = process.env.DOMAIN.trim().replace(/\/+$/, '');
    return d.startsWith('http://') || d.startsWith('https://') ? d : `https://${d}`;
  }

  // 4. Fallback to first trusted origin from CORS_ORIGIN
  if (trustedOrigins.size > 0) {
    for (const origin of trustedOrigins) {
      if (origin.startsWith('http://') || origin.startsWith('https://')) {
        return origin;
      }
    }
  }

  // 4. Production guard: Never emit localhost links to users in production
  if (isProd) {
    console.error('[CONFIG ERROR] No trusted FRONTEND_URL or PUBLIC_APP_URL configured in production! Please define FRONTEND_URL in your environment.');
    return '';
  }

  // 5. Development default fallback
  return 'http://localhost:3000';
}

/**
 * Returns an absolute, environment-aware URL for an application public asset.
 * Guarantees that any image referenced inside an HTML email has a fully qualified URL.
 *
 * @param {string} [assetPath] - Path relative to public directory (e.g. "/quroxa_new_logo.png" or "quroxa_new_logo.png")
 * @returns {string} Absolute URL (e.g. "https://quroxa.com/quroxa_new_logo.png")
 */
function getPublicAssetUrl(assetPath) {
  if (!assetPath) {
    return `${getPublicAppUrl()}/${CANONICAL_LOGO_FILENAME}`;
  }

  const cleanPath = String(assetPath).trim();

  // If already absolute HTTP/HTTPS URL, return as-is
  if (cleanPath.startsWith('http://') || cleanPath.startsWith('https://')) {
    return cleanPath;
  }

  // Base64 data URIs are explicitly stripped/blocked by Gmail and webmail clients.
  // In email contexts, fall back to the public canonical logo instead of generating a broken image.
  if (
    cleanPath.startsWith('data:image/') ||
    cleanPath.startsWith('/9j/') ||
    cleanPath.startsWith('iVBOR') ||
    cleanPath.startsWith('R0lGOD') ||
    cleanPath.startsWith('PHN2Zw')
  ) {
    return `${getPublicAppUrl()}/${CANONICAL_LOGO_FILENAME}`;
  }

  // Normalize leading slash
  const normalizedPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
  return `${getPublicAppUrl()}${normalizedPath}`;
}

/**
 * Resolves a logo URL specifically tailored for email templates.
 * If the hospital has an absolute HTTP/HTTPS logo, returns it.
 * If the hospital has a relative upload logo (/uploads/...), resolves it against the public URL.
 * If the logo is missing, empty, or a base64 data URI (blocked by Gmail), returns the canonical Quroxa logo.
 *
 * @param {string|null|undefined} logo - Raw logo from database
 * @returns {string} Absolute, email-safe image URL
 */
function resolveEmailLogoUrl(logo) {
  if (!logo) {
    return getPublicAssetUrl(CANONICAL_LOGO_FILENAME);
  }

  const clean = String(logo).trim();

  // If already absolute HTTP/HTTPS URL
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return clean;
  }

  // If relative upload or public path
  if (clean.startsWith('/uploads/') || clean.startsWith('/assets/') || clean.startsWith('/')) {
    return getPublicAssetUrl(clean);
  }

  // Base64 data URIs or monograms ('H', 'CL', etc.) cannot be rendered as <img> URLs in emails.
  // Fall back to canonical Quroxa logo.
  return getPublicAssetUrl(CANONICAL_LOGO_FILENAME);
}

/**
 * Returns the canonical Quroxa logo absolute URL.
 * @returns {string}
 */
function getCanonicalLogoUrl() {
  return getPublicAssetUrl(CANONICAL_LOGO_FILENAME);
}

/**
 * Resolves the public base URL for a specific hospital tenant.
 * If the hospital has an explicit custom domain configured (customDomain or erpCustomDomain),
 * validates and normalizes the domain.
 * Otherwise falls back to the canonical public application URL.
 *
 * @param {object} [hospital] - Hospital document or object
 * @param {import('express').Request} [req]
 * @returns {string} Fully qualified base URL for the tenant
 */
function getTenantPublicUrl(hospital, req) {
  if (hospital) {
    const custom = (hospital.customDomain || hospital.erpCustomDomain || '').trim();
    if (custom) {
      const clean = custom.replace(/\/+$/, '');
      return clean.startsWith('http://') || clean.startsWith('https://') ? clean : `https://${clean}`;
    }
  }
  return getPublicAppUrl(req);
}

/**
 * Resolves the tenant-specific public portal link.
 * If the hospital has a custom domain, links to that domain.
 * If hospitalId is present, formats /portal/:hospitalId.
 *
 * @param {object} [hospital] - Hospital document or object
 * @param {import('express').Request} [req]
 * @returns {string} Fully qualified portal URL
 */
function getTenantPortalUrl(hospital, req) {
  const base = getTenantPublicUrl(hospital, req);
  if (!base) return '';
  if (hospital && hospital.hospitalId) {
    return `${base}/portal/${hospital.hospitalId}`;
  }
  return `${base}/login`;
}

module.exports = {
  getTrustedOrigins,
  extractRequestOrigin,
  getPublicAppUrl,
  getTenantPublicUrl,
  getTenantPortalUrl,
  getPublicAssetUrl,
  resolveEmailLogoUrl,
  getCanonicalLogoUrl,
  CANONICAL_LOGO_FILENAME
};
