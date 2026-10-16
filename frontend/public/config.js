/**
 * Quroxa Runtime Configuration
 *
 * This file allows dynamic configuration of frontend service URLs without rebuilding the application bundle.
 * In containerized or static hosting environments (Docker, Kubernetes, Nginx, S3/CloudFront),
 * you can mount or overwrite this file at runtime.
 *
 * All properties are optional. If commented or empty, the application falls back to:
 * 1. Build-time environment variables (VITE_API_URL, VITE_SOCKET_URL, VITE_APP_URL)
 * 2. Same-origin relative paths (/api) for reverse proxies or unified deployments
 */
window.__QUROXA_CONFIG__ = window.__QUROXA_CONFIG__ || {
  // Fully qualified backend API base URL (e.g. "https://api.yourdomain.com/api" or "/api")
  // apiUrl: undefined,

  // Dedicated Socket.IO connection URL if different from the API host (e.g. "https://api.yourdomain.com")
  // socketUrl: undefined,

  // Canonical public frontend URL used for generated QR codes and patient portal links (e.g. "https://app.yourdomain.com")
  // publicAppUrl: undefined
};
