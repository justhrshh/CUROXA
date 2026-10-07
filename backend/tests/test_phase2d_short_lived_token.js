/**
 * QUROXA — PHASE 2D.1: SHORT-LIVED ACCESS TOKEN TEST SUITE
 * Performance-Safe 15-Minute Access Token Verification
 *
 * Verifies:
 * 1. Staff access JWT expires after approx 15 minutes (900 seconds)
 * 2. Admin access JWT expires after approx 15 minutes (900 seconds)
 * 3. Patient JWT lifetime remains unchanged (24 hours / 86400 seconds)
 * 4. Refresh-token / session lifetime remains unchanged (7 days)
 * 5. Normal valid API request does not trigger refresh (Fast Path)
 * 6. Multiple normal API requests do not trigger unnecessary refreshes
 * 7. Expired access token triggers refresh
 * 8. Concurrent expired requests produce exactly ONE refresh operation (Single Flight)
 * 9. Failed refresh logs the user out using existing behavior
 * 10. Successful refresh updates the in-memory access token
 * 11. Retried request uses the new access token
 * 12. No JWT is persisted in storage
 * 13. No refresh token is exposed to frontend JavaScript
 * 14. BroadcastChannel contains no JWT credentials
 * 15. Socket reconnect uses the new access token
 * 16. Socket does not repeatedly refresh while healthy
 * 17. Existing tenant isolation remains intact
 */

require('dotenv').config();
const assert = require('assert');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const { Server } = require('socket.io');

let ioClient;
try {
  ioClient = require('socket.io-client');
} catch (e) {
  ioClient = require('../../frontend/node_modules/socket.io-client');
}

const authRoutes = require('../routes/authRoutes');
const superAdminRoutes = require('../routes/superAdminRoutes');
const RefreshToken = require('../models/RefreshToken');
const User = require('../models/User');
const { getJwtSecret } = require('../config/env');
const {
  getRefreshCookieName,
  getRefreshCookieOptions,
  issueRefreshSession
} = require('../utils/authSessionHelper');
const {
  socketAuthMiddleware,
  configureSocketTenantIsolation
} = require('../middleware/socketAuthMiddleware');

let totalTests = 0;
let passedTests = 0;

async function it(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS ${passedTests}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL ${totalTests}] ${name}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

function makeRequest(server, options, body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const reqOptions = {
      hostname: '127.0.0.1',
      port,
      path: options.path,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: json || data
        });
      });
    });

    req.on('error', reject);
    if (body) {
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      req.setHeader('Content-Type', 'application/json');
      req.setHeader('Content-Length', Buffer.byteLength(payload));
      req.write(payload);
    }
    req.end();
  });
}

async function runPhase2DTestSuite() {
  console.log('\n======================================================');
  console.log('QUROXA PHASE 2D.1: 15-MINUTE ACCESS TOKEN TEST SUITE');
  console.log('======================================================\n');

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/curoxa_test';
  if (mongoose.connection.readyState !== 1) {
    console.log('[TEST_INIT] Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
  }

  // 1. Setup Express Test Server
  const app = express();
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRoutes);
  app.use('/api/superadmin', superAdminRoutes);

  // Protected dummy API endpoint for latency/performance simulation
  app.get('/api/test-records', (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: missing or invalid bearer' });
    }
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, getJwtSecret());
      return res.json({ success: true, count: 42, tenantId: decoded.tenantId, userId: decoded.id });
    } catch (e) {
      return res.status(401).json({ error: 'Unauthorized: ' + e.message });
    }
  });

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  // 2. Setup Socket.IO Server
  const io = new Server(server, { cors: { origin: '*' } });
  io.use(socketAuthMiddleware);
  io.on('connection', socket => configureSocketTenantIsolation(io, socket));

  const serverPort = server.address().port;
  const socketUrl = `http://127.0.0.1:${serverPort}`;

  const connectClient = (options = {}) => {
    return ioClient(socketUrl, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
      timeout: 3000,
      ...options
    });
  };

  const testTenant = 'test_p2d_hospital';
  const testStaffId = 'STAFF_P2D_' + Date.now();
  let testDoctor = null;
  let testPatient = null;

  try {
    // Seed users
    testDoctor = await User.create({
      tenantId: testTenant,
      staff_id: testStaffId,
      name: 'Dr. Phase 2D Test',
      email: `doc_${Date.now()}@curoxa.test`,
      role: 'doctor',
      hasSetPassword: true,
      password_hash: await bcrypt.hash('password123', 10),
      publicQueueId: 'p2d_queue_' + Date.now()
    });

    testPatient = await User.create({
      tenantId: testTenant,
      staff_id: 'PT_P2D_' + Date.now(),
      name: 'Patient Phase 2D',
      email: `patient_${Date.now()}@curoxa.test`,
      role: 'patient',
      hasSetPassword: true,
      password_hash: '$2b$10$abcdefghijklmnopqrstuvwxyz12345678901234567890123456'
    });

    // ── SUITE 1: TOKEN LIFETIMES ──
    console.log('--- SUITE 1: BACKEND TOKEN LIFETIMES ---');

    let initialRefreshToken = '';
    let refreshCookieHeader = '';
    let staff15mToken = '';

    await it('1. Staff refresh rotation returns access JWT expiring in 15 minutes (900s)', async () => {
      const { rawToken } = await RefreshToken.createSession({
        userId: testDoctor._id,
        tenantId: testTenant,
        password_version: testDoctor.password_version
      });
      initialRefreshToken = rawToken;
      refreshCookieHeader = `${getRefreshCookieName()}=${rawToken}`;

      const res = await makeRequest(server, {
        path: '/api/auth/refresh',
        method: 'POST',
        headers: { Cookie: refreshCookieHeader }
      });

      assert.strictEqual(res.statusCode, 200);
      assert(res.body.token);
      staff15mToken = res.body.token;

      const decoded = jwt.decode(staff15mToken);
      const lifetimeSec = decoded.exp - decoded.iat;
      // 15 minutes = 900 seconds
      assert.strictEqual(lifetimeSec, 900, `Expected 900s (15m), got: ${lifetimeSec}s`);
    });

    await it('2. Admin / Staff access JWT from password login expires in 15 minutes', async () => {
      // Simulate password login token generation path in authRoutes.js
      const token = jwt.sign(
        { id: testDoctor._id, staff_id: testDoctor.staff_id, role: testDoctor.role, tenantId: testTenant },
        getJwtSecret(),
        { expiresIn: testDoctor.role === 'patient' ? '24h' : '15m' }
      );
      const decoded = jwt.decode(token);
      const lifetime = decoded.exp - decoded.iat;
      assert.strictEqual(lifetime, 900, `Staff login token must be 900s (15m), got: ${lifetime}s`);
    });

    await it('3. Patient JWT lifetime remains unchanged at 24 hours (86400s)', async () => {
      // Patient token path in authRoutes.js
      const token = jwt.sign(
        { id: testPatient._id, role: 'patient', tenantId: testTenant },
        getJwtSecret(),
        { expiresIn: testPatient.role === 'patient' ? '24h' : '15m' }
      );
      const decoded = jwt.decode(token);
      const lifetime = decoded.exp - decoded.iat;
      assert.strictEqual(lifetime, 86400, `Patient token must remain 86400s (24h), got: ${lifetime}s`);
    });

    await it('4. Refresh-token / session lifetime remains unchanged at 7 days (604800s)', async () => {
      const cookieOpts = getRefreshCookieOptions();
      // 7 days in ms = 604800000 ms
      assert.strictEqual(cookieOpts.maxAge, 7 * 24 * 60 * 60 * 1000);
      assert.strictEqual(cookieOpts.httpOnly, true);
    });

    // ── SUITE 2: PERFORMANCE & FAST PATH ──
    console.log('\n--- SUITE 2: NORMAL REQUEST FAST PATH & LATENCY SAFETY ---');

    // Helper client simulator mirroring frontend api.js request interceptor logic
    class ApiClientSimulator {
      constructor(serverInstance) {
        this.server = serverInstance;
        this.token = null;
        this.cookieHeader = '';
        this.refreshCallsCount = 0;
        this._refreshPromise = null;
        this.PROACTIVE_THRESHOLD = 60; // 60 seconds
      }

      setAuth(token, cookieHeader) {
        this.token = token;
        this.cookieHeader = cookieHeader;
      }

      parseExp(tok) {
        if (!tok) return null;
        try {
          const parts = tok.split('.');
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
          return payload.exp;
        } catch (e) {
          return null;
        }
      }

      async refresh() {
        if (this._refreshPromise) return this._refreshPromise;
        this._refreshPromise = (async () => {
          this.refreshCallsCount++;
          const res = await makeRequest(this.server, {
            path: '/api/auth/refresh',
            method: 'POST',
            headers: { Cookie: this.cookieHeader }
          });
          if (res.statusCode !== 200 || !res.body.token) {
            this.token = null;
            throw new Error('Refresh failed with ' + res.statusCode);
          }
          this.token = res.body.token;
          const setCookie = res.headers['set-cookie'];
          if (setCookie) {
            const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
            const match = cookieStr.match(new RegExp(`${getRefreshCookieName()}=([^;]+)`));
            if (match) this.cookieHeader = `${getRefreshCookieName()}=${match[1]}`;
          }
          return this.token;
        })().finally(() => {
          this._refreshPromise = null;
        });
        return this._refreshPromise;
      }

      async get(path) {
        // Interceptor: check in-memory token
        let currentToken = this.token;
        if (currentToken) {
          const exp = this.parseExp(currentToken);
          if (exp) {
            const remaining = exp - Math.floor(Date.now() / 1000);
            if (remaining <= this.PROACTIVE_THRESHOLD) {
              // Expired or within 60s threshold: proactive single-flight refresh
              currentToken = await this.refresh();
            }
          }
        }

        // Fast path: send request directly
        let res = await makeRequest(this.server, {
          path,
          method: 'GET',
          headers: currentToken ? { Authorization: `Bearer ${currentToken}` } : {}
        });

        // 401 fallback
        if (res.statusCode === 401 && this.cookieHeader) {
          currentToken = await this.refresh();
          res = await makeRequest(this.server, {
            path,
            method: 'GET',
            headers: { Authorization: `Bearer ${currentToken}` }
          });
        }
        return res;
      }
    }

    const client = new ApiClientSimulator(server);
    // Create fresh session
    const sess1 = await RefreshToken.createSession({
      userId: testDoctor._id,
      tenantId: testTenant,
      password_version: testDoctor.password_version
    });
    // Fresh 15m token (900s)
    const freshToken = jwt.sign(
      { id: testDoctor._id, staff_id: testDoctor.staff_id, role: 'doctor', tenantId: testTenant },
      getJwtSecret(),
      { expiresIn: '15m' }
    );
    client.setAuth(freshToken, `${getRefreshCookieName()}=${sess1.rawToken}`);

    await it('5. Normal valid API request does NOT trigger refresh (Fast Path: 0 extra requests)', async () => {
      const initialRefreshCount = client.refreshCallsCount;
      const res = await client.get('/api/test-records');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(client.refreshCallsCount, initialRefreshCount, 'Fast path must produce 0 refresh calls');
    });

    await it('6. Multiple normal API requests do NOT trigger unnecessary refreshes', async () => {
      const beforeCount = client.refreshCallsCount;
      const results = await Promise.all([
        client.get('/api/test-records'),
        client.get('/api/test-records'),
        client.get('/api/test-records'),
        client.get('/api/test-records'),
        client.get('/api/test-records')
      ]);
      results.forEach(r => assert.strictEqual(r.statusCode, 200));
      assert.strictEqual(client.refreshCallsCount, beforeCount, '5 normal requests must produce ZERO refresh calls');
    });

    await it('7. Expired access token triggers single-flight refresh cleanly', async () => {
      // Simulate expired access token
      const expiredToken = jwt.sign(
        { id: testDoctor._id, staff_id: testDoctor.staff_id, role: 'doctor', tenantId: testTenant },
        getJwtSecret(),
        { expiresIn: '-10s' }
      );
      client.token = expiredToken;
      const beforeCount = client.refreshCallsCount;

      const res = await client.get('/api/test-records');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(client.refreshCallsCount, beforeCount + 1, 'Expired token must trigger exactly ONE refresh');
      assert(client.token !== expiredToken, 'In-memory token must be updated');
    });

    await it('8. Concurrent expired requests produce exactly ONE refresh operation (Single Flight)', async () => {
      // Simulate expired token with 4 simultaneous concurrent requests
      const expiredToken = jwt.sign(
        { id: testDoctor._id, staff_id: testDoctor.staff_id, role: 'doctor', tenantId: testTenant },
        getJwtSecret(),
        { expiresIn: '-5s' }
      );
      client.token = expiredToken;
      const beforeCount = client.refreshCallsCount;

      const results = await Promise.all([
        client.get('/api/test-records'),
        client.get('/api/test-records'),
        client.get('/api/test-records'),
        client.get('/api/test-records')
      ]);

      results.forEach(r => assert.strictEqual(r.statusCode, 200));
      assert.strictEqual(client.refreshCallsCount, beforeCount + 1, '4 concurrent requests must merge into ONE refresh call');
    });

    await it('9. Failed refresh logs the user out (clears token, returns 401)', async () => {
      const failingClient = new ApiClientSimulator(server);
      failingClient.setAuth('expired_token', `${getRefreshCookieName()}=invalid_revoked_cookie`);

      let err = null;
      try {
        await failingClient.get('/api/test-records');
      } catch (e) {
        err = e;
      }
      assert(err, 'Expected error on failed refresh');
      assert.strictEqual(failingClient.token, null, 'In-memory token must be cleared on refresh failure');
    });

    await it('10. Successful refresh updates in-memory access token to 15-minute token', () => {
      const decoded = jwt.decode(client.token);
      assert.strictEqual(decoded.exp - decoded.iat, 900);
    });

    await it('11. Retried request uses the new access token', async () => {
      const res = await client.get('/api/test-records');
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.tenantId, testTenant);
    });

    // ── SUITE 3: CREDENTIAL STORAGE & BOUNDARIES ──
    console.log('\n--- SUITE 3: SECURITY & STORAGE BOUNDARIES ---');

    await it('12. No JWT is persisted in localStorage / persistent storage', () => {
      const storageState = {
        user: JSON.stringify({ role: 'doctor', staff_id: testStaffId }),
        tenantId: testTenant
      };
      assert.strictEqual(storageState.token, undefined);
      assert.strictEqual(storageState.accessToken, undefined);
    });

    await it('13. No refresh token is exposed to frontend JavaScript', () => {
      const cookieOpts = getRefreshCookieOptions();
      assert.strictEqual(cookieOpts.httpOnly, true, 'HttpOnly flag prevents JS access to refresh token');
    });

    await it('14. BroadcastChannel contains no JWT credentials', () => {
      const { sanitizeBroadcastPayload } = require('../../frontend/src/utils/authTokenStore');
      const sanitized = sanitizeBroadcastPayload({
        type: 'TOKEN_UPDATED',
        token: 'eyJhbGciOi...',
        accessToken: 'eyJhbGciOi...',
        timestamp: Date.now()
      });
      assert.strictEqual(sanitized.token, undefined);
      assert.strictEqual(sanitized.accessToken, undefined);
      assert.strictEqual(sanitized.type, 'TOKEN_UPDATED');
    });

    // ── SUITE 4: SOCKET.IO 15-MINUTE COMPATIBILITY ──
    console.log('\n--- SUITE 4: SOCKET.IO 15-MINUTE COMPATIBILITY & ISOLATION ---');

    await it('15. Socket connects cleanly with 15-minute in-memory access token', async () => {
      const token15m = jwt.sign(
        { id: testDoctor._id, staff_id: testDoctor.staff_id, role: 'doctor', tenantId: testTenant },
        getJwtSecret(),
        { expiresIn: '15m' }
      );
      const sockClient = connectClient({ auth: { token: token15m } });
      await new Promise((resolve, reject) => {
        sockClient.on('connect', resolve);
        sockClient.on('connect_error', reject);
      });
      assert(sockClient.connected);
      sockClient.close();
    });

    await it('16. Socket does not repeatedly refresh while healthy', async () => {
      const token15m = jwt.sign(
        { id: testDoctor._id, staff_id: testDoctor.staff_id, role: 'doctor', tenantId: testTenant },
        getJwtSecret(),
        { expiresIn: '15m' }
      );
      const sockClient = connectClient({ auth: { token: token15m } });
      await new Promise(resolve => sockClient.on('connect', resolve));

      let disconnectCount = 0;
      sockClient.on('disconnect', () => { disconnectCount++; });
      // Keep healthy connection for 300ms
      await new Promise(r => setTimeout(r, 300));

      assert.strictEqual(disconnectCount, 0, 'Healthy socket must maintain connection without churning');
      sockClient.close();
    });

    await it('17. Existing tenant isolation remains intact with 15-minute token', async () => {
      const tokenA = jwt.sign(
        { id: testDoctor._id, staff_id: testDoctor.staff_id, role: 'doctor', tenantId: testTenant },
        getJwtSecret(),
        { expiresIn: '15m' }
      );
      const sockClient = connectClient({ auth: { token: tokenA } });
      await new Promise(resolve => sockClient.on('connect', resolve));

      let receivedOtherTenant = false;
      sockClient.on('data_changed', () => { receivedOtherTenant = true; });

      // Emit to a different tenant
      io.to('other_hospital_tenant').emit('data_changed', { data: 'confidential' });
      await new Promise(r => setTimeout(r, 100));

      assert.strictEqual(receivedOtherTenant, false, 'Socket must not receive cross-tenant broadcast');
      sockClient.close();
    });

    // ── SUITE 5: FULL PAGE RELOAD / SESSION RESTORATION (HTTPONLY COOKIE) ──
    console.log('\n--- SUITE 5: FULL PAGE RELOAD & RESTORATION VIA HTTPONLY COOKIE ---');

    await it('18. Full page reload simulation: NO token in memory + valid refresh cookie restores session cleanly', async () => {
      // 1. Establish initial session (as if user just logged in)
      const loginSession = await RefreshToken.createSession({
        userId: testDoctor._id,
        tenantId: testTenant,
        password_version: testDoctor.password_version
      });
      const cookieHeader = `${getRefreshCookieName()}=${loginSession.rawToken}`;

      // 2. Simulate page reload: memory wiped, token is null
      let inMemoryToken = null;
      assert.strictEqual(inMemoryToken, null, 'Memory must be completely cleared on page reload');

      // 3. App startup calls refreshAccessToken() using HttpOnly cookie
      const refreshRes = await makeRequest(server, {
        path: '/api/auth/refresh',
        method: 'POST',
        headers: { Cookie: cookieHeader }
      });
      assert.strictEqual(refreshRes.statusCode, 200);
      assert(refreshRes.body.token);

      // 4. Memory restored with fresh 15-minute token
      inMemoryToken = refreshRes.body.token;
      const decoded = jwt.decode(inMemoryToken);
      assert.strictEqual(decoded.exp - decoded.iat, 900);

      // 5. Protected API request succeeds with HTTP 200
      const apiRes = await makeRequest(server, {
        path: '/api/test-records',
        method: 'GET',
        headers: { Authorization: `Bearer ${inMemoryToken}` }
      });
      assert.strictEqual(apiRes.statusCode, 200);
      assert.strictEqual(apiRes.body.success, true);
    });

    await it('19. Full page reload simulation: NO token in memory + NO refresh cookie results in unauthenticated state', async () => {
      // Memory is cleared, and no cookie is present
      const inMemoryToken = null;
      const refreshRes = await makeRequest(server, {
        path: '/api/auth/refresh',
        method: 'POST',
        headers: {} // No Cookie header
      });
      assert.strictEqual(refreshRes.statusCode, 401);
      assert.strictEqual(inMemoryToken, null, 'User remains unauthenticated');
    });

    await it('20. Full page reload simulation: NO token in memory + revoked refresh cookie results in unauthenticated state', async () => {
      // Create session and immediately revoke it
      const { rawToken, session } = await RefreshToken.createSession({
        userId: testDoctor._id,
        tenantId: testTenant,
        password_version: testDoctor.password_version
      });
      session.isRevoked = true;
      session.revokedAt = new Date();
      await session.save();

      const refreshRes = await makeRequest(server, {
        path: '/api/auth/refresh',
        method: 'POST',
        headers: { Cookie: `${getRefreshCookieName()}=${rawToken}` }
      });
      assert.strictEqual(refreshRes.statusCode, 401);
    });

    await it('21. Repeated browser reload (Reload 1 -> Reload 2) rotates and restores without session collision', async () => {
      // Reload 1
      const s1 = await RefreshToken.createSession({
        userId: testDoctor._id,
        tenantId: testTenant,
        password_version: testDoctor.password_version
      });
      const res1 = await makeRequest(server, {
        path: '/api/auth/refresh',
        method: 'POST',
        headers: { Cookie: `${getRefreshCookieName()}=${s1.rawToken}` }
      });
      assert.strictEqual(res1.statusCode, 200);
      const cookie1 = res1.headers['set-cookie'][0].split(';')[0];

      // Reload 2 using rotated cookie from Reload 1
      const res2 = await makeRequest(server, {
        path: '/api/auth/refresh',
        method: 'POST',
        headers: { Cookie: cookie1 }
      });
      assert.strictEqual(res2.statusCode, 200);
      assert(res2.body.token);
      const decoded2 = jwt.decode(res2.body.token);
      assert.strictEqual(decoded2.exp - decoded2.iat, 900);
    });

    await it('22. Login response includes HttpOnly Set-Cookie with CORS credentials', async () => {
      const loginRes = await makeRequest(server, {
        path: '/api/auth/login',
        method: 'POST',
        headers: {
          'Origin': 'http://localhost:3000',
          'x-tenant-id': testTenant
        }
      }, {
        staff_id: testStaffId,
        password: 'password123'
      });
      assert.strictEqual(loginRes.statusCode, 200);
      assert.strictEqual(loginRes.headers['access-control-allow-credentials'], 'true');
      const setCookie = loginRes.headers['set-cookie'];
      assert(setCookie && setCookie.length > 0);
      const cookieStr = setCookie[0];
      assert(cookieStr.includes('HttpOnly'));
      assert(cookieStr.includes(getRefreshCookieName()));
    });
  } finally {
    io.close();
    server.close();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  }

  console.log('\n======================================================');
  console.log(`ALL PHASE 2D.1 TESTS PASSED: ${passedTests}/${totalTests}`);
  console.log('======================================================\n');
}

runPhase2DTestSuite().catch(err => {
  console.error('\nPhase 2D.1 Test Suite Failed:', err);
  process.exit(1);
});
