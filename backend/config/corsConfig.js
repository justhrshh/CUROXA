/**
 * QUROXA — STAGE G.2: PRODUCTION CORS & SOCKET.IO ORIGIN SECURITY HARDENING
 *
 * Implements strict, explicit origin validation for:
 * 1. Express API and preflight OPTIONS requests.
 * 2. Socket.IO connection handshakes and WebSocket transport.
 *
 * Key Security Invariants:
 * - Exact origin matching (protocol + hostname + port).
 * - NO substring or regex matching (e.g. evil-quroxa.onrender.com is rejected).
 * - Reject 'Origin: null' and malformed origins.
 * - Always emit exact approved origin in Access-Control-Allow-Origin with credentials: true.
 * - Never emit wildcard '*' when credentials: true.
 * - Allow non-browser requests without Origin header (curl, mobile, server-to-server)
 *   while relying on standard route-level JWT/cookie authentication.
 */

/**
 * Normalizes an origin string into a canonical URL origin (lowercase protocol + host + port).
 * Returns null if the origin is invalid, malformed, or contains invalid protocols.
 *
 * @param {string} originStr
 * @returns {string|null}
 */
function normalizeOrigin(originStr) {
  if (!originStr || typeof originStr !== 'string') return null;
  const trimmed = originStr.trim();
  if (
    !trimmed ||
    trimmed === 'null' ||
    trimmed === '*' ||
    trimmed === 'true' ||
    trimmed === 'false'
  ) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    // Return canonical origin (scheme + '//' + host[:port])
    return parsed.origin.toLowerCase();
  } catch (_) {
    return null;
  }
}

/**
 * Parses and returns the Set of explicitly approved frontend origins from environment variables.
 * Inspects:
 * - STAFF_FRONTEND_URL
 * - PATIENT_FRONTEND_URL
 * - CORS_ORIGIN
 * - FRONTEND_URL
 *
 * In production (NODE_ENV === 'production'), only explicitly configured production origins are accepted.
 * In development / test, safe localhost defaults are provided if no configuration exists.
 *
 * @returns {Set<string>}
 */
function getParsedOriginsFromEnv() {
  const origins = new Set();
  const isProd = process.env.NODE_ENV === 'production';

  const addCandidates = (envVar) => {
    if (!envVar || typeof envVar !== 'string') return;
    const parts = envVar.split(',');
    for (const part of parts) {
      const norm = normalizeOrigin(part);
      if (norm) {
        origins.add(norm);
      }
    }
  };

  addCandidates(process.env.STAFF_FRONTEND_URL);
  addCandidates(process.env.PATIENT_FRONTEND_URL);
  addCandidates(process.env.CORS_ORIGIN);
  addCandidates(process.env.FRONTEND_URL);

  // In non-production environments (development / local testing),
  // ensure exact local development origins are permitted:
  // - http://localhost:3000 (staff frontend default)
  // - http://localhost:3001 (staff frontend alternate)
  // - http://localhost:3002 (patient frontend)
  // - http://localhost:5173 (vite default dev server)
  if (!isProd) {
    origins.add('http://localhost:3000');
    origins.add('http://localhost:3001');
    origins.add('http://localhost:3002');
    origins.add('http://localhost:5173');
  }

  return origins;
}

/**
 * Determines whether a candidate request origin matches the explicit allowlist.
 * Performs exact comparison against the Set of normalized approved origins.
 *
 * @param {string} origin
 * @param {Set<string>} allowedOriginsSet
 * @returns {boolean}
 */
function isOriginAllowed(origin, allowedOriginsSet) {
  if (!origin || typeof origin !== 'string') return false;
  if (origin === 'null') return false;
  const norm = normalizeOrigin(origin);
  if (!norm) return false;
  return allowedOriginsSet.has(norm);
}

/**
 * Returns Express CORS configuration options.
 *
 * @returns {import('cors').CorsOptions}
 */
function getCorsOptions() {
  const allowedOrigins = getParsedOriginsFromEnv();

  if (process.env.NODE_ENV === 'production' && allowedOrigins.size === 0) {
    console.error(
      '[CORS_SECURITY_WARNING] Production mode active but NO valid origins configured in STAFF_FRONTEND_URL, PATIENT_FRONTEND_URL, or CORS_ORIGIN! All browser cross-origin requests will be rejected.'
    );
  }

  return {
    origin: (origin, callback) => {
      // 1. Non-browser requests without Origin header (curl, mobile, server-to-server)
      // Allowed through; standard authentication (JWT / cookies) protects protected endpoints.
      if (!origin) {
        return callback(null, true);
      }

      // 2. Reject explicit 'null' origin
      if (origin === 'null') {
        return callback(null, false);
      }

      // 3. Exact origin match
      if (isOriginAllowed(origin, allowedOrigins)) {
        return callback(null, true);
      }

      // 4. Reject unapproved origin (no Access-Control-Allow-Origin header returned)
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-tenant-id',
      'x-bypass-consent-emergency',
      'Cache-Control',
      'Pragma',
      'Expires',
      'x-requested-with',
      'Accept',
      'Origin'
    ],
    exposedHeaders: ['Content-Disposition']
  };
}

/**
 * Returns Socket.IO CORS and handshake origin validation configuration.
 *
 * @returns {object}
 */
function getSocketIoCorsConfig() {
  const allowedOrigins = getParsedOriginsFromEnv();

  return {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (origin === 'null') return callback(new Error('Origin null rejected'), false);
        if (isOriginAllowed(origin, allowedOrigins)) {
          return callback(null, true);
        }
        return callback(new Error(`Socket.IO CORS origin ${origin} unauthorized`), false);
      },
      methods: ['GET', 'POST'],
      credentials: true
    },
    allowRequest: (req, callback) => {
      const origin = req.headers && req.headers.origin;
      if (origin) {
        if (origin === 'null') {
          console.warn('[SOCKET_CORS_REJECT] Handshake rejected for null origin');
          return callback('Origin null rejected', false);
        }
        if (!isOriginAllowed(origin, allowedOrigins)) {
          console.warn(`[SOCKET_CORS_REJECT] WebSocket handshake rejected for origin: ${origin}`);
          return callback('Origin unauthorized', false);
        }
      }
      // Non-browser or missing origin allowed through handshake;
      // socketAuthMiddleware enforces mandatory JWT / token validation.
      callback(null, true);
    }
  };
}

module.exports = {
  normalizeOrigin,
  getParsedOriginsFromEnv,
  isOriginAllowed,
  getCorsOptions,
  getSocketIoCorsConfig
};
