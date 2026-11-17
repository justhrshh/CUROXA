/**
 * VERIFICATION SCRIPT: Separated QUROXA Patient Portal CORS Fix
 *
 * Verifies:
 * 1. OPTIONS preflight from http://localhost:3002 and http://localhost:3001.
 * 2. Exact Access-Control-Allow-Origin header returned (no wildcard, exact match).
 * 3. POST request to /api/auth/patient-portal/global/send-otp receives exact CORS headers.
 * 4. Socket.IO origin validation (cors.origin and allowRequest handshake).
 * 5. Production isolation: In NODE_ENV=production, localhost origins are strictly rejected.
 * 6. Malicious/unauthorized origins are rejected in both development and production.
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

async function run() {
  console.log("======================================================================");
  console.log("  VERIFICATION: LOCAL CORS FIX FOR PATIENT PORTAL (http://localhost:3002)");
  console.log("======================================================================\n");

  const origEnv = { ...process.env };

  try {
    // ------------------------------------------------------------------
    // STEP 1 & 2: Local development parsed origins & preflight
    // ------------------------------------------------------------------
    console.log("--- Step 1: Development Environment Origins Resolution ---");
    process.env.NODE_ENV = "development";
    require("dotenv").config({ path: require("path").resolve(__dirname, "../.env"), override: true });

    const devOrigins = getParsedOriginsFromEnv();
    console.log("  Active dev allowed origins:", Array.from(devOrigins));

    it("Includes http://localhost:3002 (patient frontend)", () => {
      assert.strictEqual(devOrigins.has("http://localhost:3002"), true);
    });

    it("Includes http://localhost:3001 (staff frontend alternate)", () => {
      assert.strictEqual(devOrigins.has("http://localhost:3001"), true);
    });

    it("Includes http://localhost:3000 (staff frontend default)", () => {
      assert.strictEqual(devOrigins.has("http://localhost:3000"), true);
    });

    it("Does NOT include malicious/external origins", () => {
      assert.strictEqual(devOrigins.has("http://evil.com"), false);
      assert.strictEqual(devOrigins.has("http://localhost:3002.attacker.com"), false);
      assert.strictEqual(devOrigins.has("null"), false);
      assert.strictEqual(devOrigins.has("*"), false);
    });

    // ------------------------------------------------------------------
    // STEP 2 & 3: OPTIONS Preflight from http://localhost:3002
    // ------------------------------------------------------------------
    console.log("\n--- Step 2 & 3: OPTIONS Preflight from http://localhost:3002 ---");
    const devCors = cors(getCorsOptions());

    await itAsync("OPTIONS preflight from http://localhost:3002 returns 204 with exact allowed origin", async () => {
      const res = await testCorsMiddleware(devCors, {
        method: "OPTIONS",
        url: "/api/auth/patient-portal/global/send-otp",
        headers: {
          Origin: "http://localhost:3002",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type, Authorization, x-tenant-id"
        }
      });
      assert.strictEqual(res.statusCode, 204);
      assert.strictEqual(res.headers["access-control-allow-origin"], "http://localhost:3002");
      assert.strictEqual(res.headers["access-control-allow-credentials"], "true");
      assert.ok(res.headers["access-control-allow-methods"]?.includes("POST"));
      assert.ok(res.headers["access-control-allow-headers"]?.toLowerCase().includes("content-type"));
      assert.ok(res.headers["access-control-allow-headers"]?.toLowerCase().includes("authorization"));
      assert.ok(res.headers["access-control-allow-headers"]?.toLowerCase().includes("x-tenant-id"));
    });

    await itAsync("OPTIONS preflight from http://localhost:3001 returns 204 with exact allowed origin", async () => {
      const res = await testCorsMiddleware(devCors, {
        method: "OPTIONS",
        url: "/api/auth/patient-portal/global/send-otp",
        headers: {
          Origin: "http://localhost:3001",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type"
        }
      });
      assert.strictEqual(res.statusCode, 204);
      assert.strictEqual(res.headers["access-control-allow-origin"], "http://localhost:3001");
      assert.strictEqual(res.headers["access-control-allow-credentials"], "true");
    });

    await itAsync("OPTIONS preflight from unapproved origin receives NO Access-Control-Allow-Origin", async () => {
      const res = await testCorsMiddleware(devCors, {
        method: "OPTIONS",
        url: "/api/auth/patient-portal/global/send-otp",
        headers: {
          Origin: "http://attacker-controlled-site.com",
          "Access-Control-Request-Method": "POST"
        }
      });
      assert.strictEqual(res.headers["access-control-allow-origin"], undefined);
    });

    // ------------------------------------------------------------------
    // STEP 4: POST /api/auth/patient-portal/global/send-otp from 3002
    // ------------------------------------------------------------------
    console.log("\n--- Step 4: POST /api/auth/patient-portal/global/send-otp Reachability ---");

    await itAsync("POST request with Origin: http://localhost:3002 receives exact Access-Control-Allow-Origin", async () => {
      const res = await testCorsMiddleware(devCors, {
        method: "POST",
        url: "/api/auth/patient-portal/global/send-otp",
        headers: {
          Origin: "http://localhost:3002",
          "Content-Type": "application/json"
        }
      });
      assert.strictEqual(res.nextCalled, true, "CORS middleware allowed request to proceed to route handler");
      assert.strictEqual(res.headers["access-control-allow-origin"], "http://localhost:3002");
      assert.strictEqual(res.headers["access-control-allow-credentials"], "true");
    });

    // ------------------------------------------------------------------
    // STEP 5: Socket.IO Origin Validation
    // ------------------------------------------------------------------
    console.log("\n--- Step 5: Socket.IO Origin Validation ---");
    const devSocketConfig = getSocketIoCorsConfig();

    it("Socket.IO allowRequest accepts http://localhost:3002", () => {
      let allowed = null;
      devSocketConfig.allowRequest({ headers: { origin: "http://localhost:3002" } }, (err, success) => {
        allowed = success;
      });
      assert.strictEqual(allowed, true);
    });

    it("Socket.IO cors.origin accepts http://localhost:3002", () => {
      let allowed = null;
      devSocketConfig.cors.origin("http://localhost:3002", (err, success) => {
        allowed = success;
      });
      assert.strictEqual(allowed, true);
    });

    it("Socket.IO rejects unapproved origin in development", () => {
      let allowed = null;
      devSocketConfig.allowRequest({ headers: { origin: "http://evil.com" } }, (err, success) => {
        allowed = success;
      });
      assert.strictEqual(allowed, false);
    });

    it("Socket.IO rejects null origin in development", () => {
      let allowed = null;
      devSocketConfig.allowRequest({ headers: { origin: "null" } }, (err, success) => {
        allowed = success;
      });
      assert.strictEqual(allowed, false);
    });

    // ------------------------------------------------------------------
    // STEP 6: Production CORS Origins Invariant Protection
    // ------------------------------------------------------------------
    console.log("\n--- Step 6: Production CORS Invariant Verification ---");
    process.env.NODE_ENV = "production";
    process.env.STAFF_FRONTEND_URL = "https://curoxa-1.onrender.com";
    process.env.PATIENT_FRONTEND_URL = "https://quroxa-patient-frontend.onrender.com";
    delete process.env.CORS_ORIGIN;
    delete process.env.FRONTEND_URL;

    const prodOrigins = getParsedOriginsFromEnv();
    console.log("  Active prod allowed origins:", Array.from(prodOrigins));

    it("Production origins include exactly configured production URLs", () => {
      assert.strictEqual(prodOrigins.has("https://curoxa-1.onrender.com"), true);
      assert.strictEqual(prodOrigins.has("https://quroxa-patient-frontend.onrender.com"), true);
      assert.strictEqual(prodOrigins.size, 2);
    });

    it("Production strictly excludes localhost:3000, 3001, 3002, 5173", () => {
      assert.strictEqual(prodOrigins.has("http://localhost:3000"), false);
      assert.strictEqual(prodOrigins.has("http://localhost:3001"), false);
      assert.strictEqual(prodOrigins.has("http://localhost:3002"), false);
      assert.strictEqual(prodOrigins.has("http://localhost:5173"), false);
    });

    const prodCors = cors(getCorsOptions());

    await itAsync("Production rejects http://localhost:3002 preflight OPTIONS", async () => {
      const res = await testCorsMiddleware(prodCors, {
        method: "OPTIONS",
        url: "/api/auth/patient-portal/global/send-otp",
        headers: {
          Origin: "http://localhost:3002",
          "Access-Control-Request-Method": "POST"
        }
      });
      assert.strictEqual(res.headers["access-control-allow-origin"], undefined);
    });

    const prodSocketConfig = getSocketIoCorsConfig();

    it("Production Socket.IO rejects http://localhost:3002", () => {
      let allowed = null;
      prodSocketConfig.allowRequest({ headers: { origin: "http://localhost:3002" } }, (err, success) => {
        allowed = success;
      });
      assert.strictEqual(allowed, false);
    });

    it("Production Socket.IO accepts production patient origin", () => {
      let allowed = null;
      prodSocketConfig.allowRequest({ headers: { origin: "https://quroxa-patient-frontend.onrender.com" } }, (err, success) => {
        allowed = success;
      });
      assert.strictEqual(allowed, true);
    });

  } finally {
    process.env = origEnv;
  }

  console.log("\n======================================================================");
  console.log(`  VERIFICATION RESULTS: ${passed} PASSED | ${failed} FAILED`);
  console.log("======================================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Verification execution failed:", err);
  process.exit(1);
});
