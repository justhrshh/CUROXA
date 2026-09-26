/**
 * Centralized Application URL and Public Asset Helper for Quroxa Healthcare
 *
 * Manages environment-aware public origins and resolves absolute, email-safe
 * asset URLs across development and production environments.
 */

const CANONICAL_LOGO_FILENAME = 'quroxa_new_logo.png';

/**
 * Resolves the centralized public application base URL.
 * Prioritizes standard environment variables:
 * 1. PUBLIC_APP_URL
 * 2. FRONTEND_URL (canonical in existing .env)
 * 3. APP_URL / CLIENT_URL
 * 4. First origin in CORS_ORIGIN
 * 5. Production fallback (https://curoxa.onrender.com) or Development (http://localhost:3000)
 *
 * Always trims trailing slashes for clean concatenation.
 * @returns {string} Fully qualified base URL (e.g. "https://quroxa.com" or "http://localhost:3000")
 */
function getPublicAppUrl() {
  const rawUrl =
    process.env.PUBLIC_APP_URL ||
    process.env.FRONTEND_URL ||
    process.env.APP_URL ||
    process.env.CLIENT_URL ||
    (process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',')[0].trim() : null) ||
    (process.env.NODE_ENV === 'production' ? 'https://curoxa.onrender.com' : 'http://localhost:3000');
  return String(rawUrl).trim().replace(/\/+$/, '');
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

module.exports = {
  getPublicAppUrl,
  getPublicAssetUrl,
  resolveEmailLogoUrl,
  getCanonicalLogoUrl,
  CANONICAL_LOGO_FILENAME
};
