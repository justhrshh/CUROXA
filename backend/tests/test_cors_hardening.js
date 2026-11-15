/**
 * QUROXA — STAGE G.2: AUTOMATED CORS & SOCKET.IO SECURITY TESTS
 *
 * Validates:
 * 1. Origin normalization, parsing, and exact-match allowlist.
 * 2. Express HTTP requests (GET, POST, OPTIONS preflights, headers, credentials).
 * 3. Exact approved origins (Staff, Patient).
 * 4. Rejection of unapproved, lookalike, insecure (HTTP vs HTTPS), and null origins.
 * 5. Non-browser requests without Origin header.
 * 6. Socket.IO handshake origin policy (allowRequest).
 */

const assert = require("assert");
const cors = require("cors");
const {
  normalizeOrigin,
  getParsedOriginsFromEnv,
  isOriginAllowed,
  getCorsOptions,
  getSocketIoCorsConfig
} = require("../config/corsConfig");

let passed = 0;
let failed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

async function itAsync(desc, fn) {
  try {
    await fn();
    console.log(`  [PASS] ${desc}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] ${desc}: ${err.message}`);
    failed++;
  }
}

/**
 * In-memory HTTP mock helper for testing Express CORS middleware without socket port binding.
 */
function testCorsMiddleware(corsMiddleware, { method = "GET", headers = {}, url = "/api/test" }) {
  return new Promise((resolve) => {
    const resHeaders = {};
    let statusCode = 200;
    let body = "";

    const lowerHeaders = {};
    for (const [k, v] of Object.entries(headers)) {
      lowerHeaders[k.toLowerCase()] = v;
    }

    const req = {
      method,
      url,
      headers: lowerHeaders,
      get: (header) => lowerHeaders[header.toLowerCase()]
    };

    const res = {
      _status: 200,
      get statusCode() {
        return this._status;
      },
      set statusCode(code) {
        this._status = code;
      },
      setHeader: (k, v) => {
        resHeaders[k.toLowerCase()] = v;
      },
      getHeader: (k) => resHeaders[k.toLowerCase()],
      status: function (code) {
        this._status = code;
        return this;
      },
      send: function (b) {
        body = b;
        resolve({ statusCode: this._status, headers: resHeaders, body, nextCalled: false });
      },
      json: function (b) {
        body = JSON.stringify(b);
        resolve({ statusCode: this._status, headers: resHeaders, body, nextCalled: false });
      },
      end: function (b) {
        if (b) body = b;
        resolve({ statusCode: this._status, headers: resHeaders, body, nextCalled: false });
      }
    };

    corsMiddleware(req, res, (err) => {
      resolve({ statusCode, headers: resHeaders, body, nextCalled: true, err });
    });
  });
}

async function runTests() {
  console.log("======================================================================");
  console.log("  QUROXA STAGE G.2: CORS & SOCKET.IO ORIGIN HARDENING TEST SUITE      ");
  console.log("======================================================================\n");

  const origEnv = { ...process.env };

  try {
    // ──────────────────────────────────────────────────────────────────
    // SUITE 1: ORIGIN NORMALIZATION & PARSING
    // ──────────────────────────────────────────────────────────────────
    console.log("--- SUITE 1: Origin Normalization & Parsing ---");

    it("Normalizes HTTPS origin and removes trailing slash", () => {
      assert.strictEqual(
        normalizeOrigin("https://curoxa-1.onrender.com/"),
        "https://curoxa-1.onrender.com"
      );
    });

    it("Normalizes HTTP origin with port and whitespace", () => {
      assert.strictEqual(
        normalizeOrigin("  http://localhost:5173/  "),
        "http://localhost:5173"
      );
    });

    it("Converts hostnames to lowercase", () => {
      assert.strictEqual(
        normalizeOrigin("HTTPS://CUROXA-1.ONRENDER.COM"),
        "https://curoxa-1.onrender.com"
      );
    });

    it("Rejects 'null' origin string", () => {
      assert.strictEqual(normalizeOrigin("null"), null);
    });

    it("Rejects '*' wildcard origin string", () => {
      assert.strictEqual(normalizeOrigin("*"), null);
    });

    it("Rejects invalid / malformed URLs", () => {
      assert.strictEqual(normalizeOrigin("not-a-url"), null);
      assert.strictEqual(normalizeOrigin(""), null);
      assert.strictEqual(normalizeOrigin(null), null);
      assert.strictEqual(normalizeOrigin(undefined), null);
      assert.strictEqual(normalizeOrigin("ftp://example.com"), null);
    });

    // ──────────────────────────────────────────────────────────────────
    // SUITE 2: ENVIRONMENT VARIABLE RESOLUTION
    // ──────────────────────────────────────────────────────────────────
    console.log("\n--- SUITE 2: Environment Variable Allowlist Resolution ---");

    it("Parses multiple frontend environment variables correctly", () => {
      process.env.STAFF_FRONTEND_URL = "https://curoxa-1.onrender.com/";
      process.env.PATIENT_FRONTEND_URL = "https://quroxa-patient-frontend.onrender.com";
      process.env.CORS_ORIGIN = "https://portal.quroxa.com,https://curoxa-1.onrender.com";
      process.env.NODE_ENV = "production";

      const origins = getParsedOriginsFromEnv();
      assert.strictEqual(origins.has("https://curoxa-1.onrender.com"), true);
      assert.strictEqual(origins.has("https://quroxa-patient-frontend.onrender.com"), true);
      assert.strictEqual(origins.has("https://portal.quroxa.com"), true);
      // In production, localhost must NOT be auto-added
      assert.strictEqual(origins.has("http://localhost:3000"), false);
    });

    it("Provides safe localhost defaults in development if env is empty", () => {
      delete process.env.STAFF_FRONTEND_URL;
      delete process.env.PATIENT_FRONTEND_URL;
      delete process.env.CORS_ORIGIN;
      delete process.env.FRONTEND_URL;
      process.env.NODE_ENV = "development";

      const origins = getParsedOriginsFromEnv();
      assert.strictEqual(origins.has("http://localhost:3000"), true);
      assert.strictEqual(origins.has("http://localhost:5173"), true);
    });

    // ──────────────────────────────────────────────────────────────────
    // SUITE 3: EXACT ORIGIN MATCHING & SECURITY REJECTIONS
    // ──────────────────────────────────────────────────────────────────
    console.log("\n--- SUITE 3: Exact Match & Rejection of Malicious Origins ---");

    const approvedSet = new Set([
      "https://curoxa-1.onrender.com",
      "https://quroxa-patient-frontend.onrender.com"
    ]);

    it("Accepts exact staff origin", () => {
      assert.strictEqual(
        isOriginAllowed("https://curoxa-1.onrender.com", approvedSet),
        true
      );
    });

    it("Accepts exact patient origin", () => {
      assert.strictEqual(
        isOriginAllowed("https://quroxa-patient-frontend.onrender.com", approvedSet),
        true
      );
    });

    it("Rejects lookalike domain with prefix", () => {
      assert.strictEqual(
        isOriginAllowed("https://evil-quroxa-patient-frontend.onrender.com", approvedSet),
        false
      );
    });

    it("Rejects lookalike domain with suffix / subdomain", () => {
      assert.strictEqual(
        isOriginAllowed("https://quroxa-patient-frontend.onrender.com.attacker.com", approvedSet),
        false
      );
    });

    it("Rejects insecure HTTP version of HTTPS production origin", () => {
      assert.strictEqual(
        isOriginAllowed("http://quroxa-patient-frontend.onrender.com", approvedSet),
        false
      );
      assert.strictEqual(
        isOriginAllowed("http://curoxa-1.onrender.com", approvedSet),
        false
      );
    });

    it("Rejects null origin", () => {
      assert.strictEqual(isOriginAllowed("null", approvedSet), false);
    });

    it("Rejects unapproved localhost in production allowlist", () => {
      assert.strictEqual(isOriginAllowed("http://localhost:3000", approvedSet), false);
    });

    // ──────────────────────────────────────────────────────────────────
    // SUITE 4: EXPRESS HTTP END-TO-END CORS BEHAVIOR
    // ──────────────────────────────────────────────────────────────────
    console.log("\n--- SUITE 4: Express HTTP In-Memory CORS Tests ---");

    // Configure test production environment
    process.env.NODE_ENV = "production";
    process.env.STAFF_FRONTEND_URL = "https://curoxa-1.onrender.com";
    process.env.PATIENT_FRONTEND_URL = "https://quroxa-patient-frontend.onrender.com";
    delete process.env.CORS_ORIGIN;
    delete process.env.FRONTEND_URL;

    const corsMiddleware = cors(getCorsOptions());

    await itAsync("Approved Staff origin receives Access-Control-Allow-Origin & credentials", async () => {
      const res = await testCorsMiddleware(corsMiddleware, {
        method: "GET",
        headers: { Origin: "https://curoxa-1.onrender.com" }
      });
      assert.strictEqual(res.nextCalled, true);
      assert.strictEqual(
        res.headers["access-control-allow-origin"],
        "https://curoxa-1.onrender.com"
      );
      assert.strictEqual(res.headers["access-control-allow-credentials"], "true");
      assert.ok(res.headers["vary"]?.includes("Origin"));
    });

    await itAsync("Approved Patient origin receives Access-Control-Allow-Origin & credentials", async () => {
      const res = await testCorsMiddleware(corsMiddleware, {
        method: "POST",
        headers: { Origin: "https://quroxa-patient-frontend.onrender.com" }
      });
      assert.strictEqual(res.nextCalled, true);
      assert.strictEqual(
        res.headers["access-control-allow-origin"],
        "https://quroxa-patient-frontend.onrender.com"
      );
      assert.strictEqual(res.headers["access-control-allow-credentials"], "true");
    });

    await itAsync("OPTIONS preflight for approved origin returns status 204 with complete CORS headers", async () => {
      const res = await testCorsMiddleware(corsMiddleware, {
        method: "OPTIONS",
        headers: {
          Origin: "https://quroxa-patient-frontend.onrender.com",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Authorization, Content-Type, x-tenant-id"
        }
      });
      assert.strictEqual(res.statusCode, 204);
      assert.strictEqual(
        res.headers["access-control-allow-origin"],
        "https://quroxa-patient-frontend.onrender.com"
      );
      assert.strictEqual(res.headers["access-control-allow-credentials"], "true");
      assert.ok(res.headers["access-control-allow-methods"]?.includes("POST"));
      assert.ok(res.headers["access-control-allow-headers"]?.toLowerCase().includes("authorization"));
    });

    await itAsync("Unapproved origin GET does NOT receive Access-Control-Allow-Origin", async () => {
      const res = await testCorsMiddleware(corsMiddleware, {
        method: "GET",
        headers: { Origin: "https://malicious-site.com" }
      });
      assert.strictEqual(res.nextCalled, true);
      assert.strictEqual(res.headers["access-control-allow-origin"], undefined);
    });

    await itAsync("Unapproved origin OPTIONS preflight does NOT receive Access-Control-Allow-Origin", async () => {
      const res = await testCorsMiddleware(corsMiddleware, {
        method: "OPTIONS",
        headers: {
          Origin: "https://malicious-site.com",
          "Access-Control-Request-Method": "POST"
        }
      });
      assert.strictEqual(res.headers["access-control-allow-origin"], undefined);
    });

    await itAsync("Origin 'null' does NOT receive Access-Control-Allow-Origin", async () => {
      const res = await testCorsMiddleware(corsMiddleware, {
        method: "GET",
        headers: { Origin: "null" }
      });
      assert.strictEqual(res.nextCalled, true);
      assert.strictEqual(res.headers["access-control-allow-origin"], undefined);
    });

    await itAsync("Non-browser request without Origin header succeeds cleanly (curl / server-to-server)", async () => {
      const res = await testCorsMiddleware(corsMiddleware, {
        method: "GET",
        headers: {} // No Origin header
      });
      assert.strictEqual(res.nextCalled, true);
      assert.strictEqual(res.headers["access-control-allow-origin"], undefined);
    });

    // ──────────────────────────────────────────────────────────────────
    // SUITE 5: SOCKET.IO HANDSHAKE ORIGIN VALIDATION
    // ──────────────────────────────────────────────────────────────────
    console.log("\n--- SUITE 5: Socket.IO Handshake Origin Policy Tests ---");

    const socketConfig = getSocketIoCorsConfig();

    it("Socket.IO allowRequest accepts approved Staff origin", () => {
      const req = { headers: { origin: "https://curoxa-1.onrender.com" } };
      let allowed = null;
      socketConfig.allowRequest(req, (err, success) => {
        allowed = success;
      });
      assert.strictEqual(allowed, true);
    });

    it("Socket.IO allowRequest accepts approved Patient origin", () => {
      const req = { headers: { origin: "https://quroxa-patient-frontend.onrender.com" } };
      let allowed = null;
      socketConfig.allowRequest(req, (err, success) => {
        allowed = success;
      });
      assert.strictEqual(allowed, true);
    });

    it("Socket.IO allowRequest rejects unapproved external origin", () => {
      const req = { headers: { origin: "https://evil-hacker.com" } };
      let allowed = null;
      socketConfig.allowRequest(req, (err, success) => {
        allowed = success;
      });
      assert.strictEqual(allowed, false);
    });

    it("Socket.IO allowRequest rejects lookalike origin", () => {
      const req = { headers: { origin: "https://curoxa-1.onrender.com.attacker.com" } };
      let allowed = null;
      socketConfig.allowRequest(req, (err, success) => {
        allowed = success;
      });
      assert.strictEqual(allowed, false);
    });

    it("Socket.IO allowRequest rejects 'null' origin", () => {
      const req = { headers: { origin: "null" } };
      let allowed = null;
      socketConfig.allowRequest(req, (err, success) => {
        allowed = success;
      });
      assert.strictEqual(allowed, false);
    });

    it("Socket.IO allowRequest permits requests without Origin (non-browser clients)", () => {
      const req = { headers: {} };
      let allowed = null;
      socketConfig.allowRequest(req, (err, success) => {
        allowed = success;
      });
      assert.strictEqual(allowed, true);
    });

  } finally {
    process.env = origEnv;
  }

  console.log("\n======================================================================");
  console.log(`  RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("======================================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner execution failed:", err);
  process.exit(1);
});
