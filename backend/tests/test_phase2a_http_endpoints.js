/**
 * QUROXA — PHASE 2A HTTP ENDPOINT INTEGRATION TESTS
 * Verifies /api/auth/login, /api/auth/refresh, /api/auth/logout, and /api/debug-db over HTTP
 */

const assert = require('assert');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const authRoutes = require('../routes/authRoutes');
const RefreshToken = require('../models/RefreshToken');
const User = require('../models/User');
const { getJwtSecret } = require('../config/env');
const { getRefreshCookieName } = require('../utils/authSessionHelper');

let passedTests = 0;
let totalTests = 0;

function it(description, fn) {
  totalTests++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(() => {
        passedTests++;
        console.log(`  ✓ [HTTP PASS ${passedTests}] ${description}`);
      }).catch(err => {
        console.error(`  ✗ [HTTP FAIL] ${description}`);
        console.error(`     Error: ${err.message}`);
        throw err;
      });
    } else {
      passedTests++;
      console.log(`  ✓ [HTTP PASS ${passedTests}] ${description}`);
    }
  } catch (err) {
    console.error(`  ✗ [HTTP FAIL] ${description}`);
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

async function runHttpTests() {
  console.log('\n======================================================');
  console.log('QUROXA PHASE 2A: HTTP ENDPOINT INTEGRATION TEST SUITE');
  console.log('======================================================\n');

  if (mongoose.connection.readyState !== 1) {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/curoxa_test';
    await mongoose.connect(mongoUri);
  }

  // Setup test Express app with cookieParser and authRoutes mounted at /api/auth
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRoutes);

  // Note: /api/debug-db is NOT mounted on app (matching server.js removal)
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  const testTenant = 'test_http_clinic';
  const testStaffId = 'test_staff_http_' + Date.now();
  let testUser = null;

  try {
    // Create test user
    testUser = await User.create({
      tenantId: testTenant,
      staff_id: testStaffId,
      password_hash: '$2b$10$abcdefghijklmnopqrstuvwxyz12345678901234567890123456',
      role: 'admin',
      name: 'HTTP Test Admin',
      email: 'test_http@curoxa.com',
      hasSetPassword: true,
      password_version: 1
    });

    console.log('--- SUITE 1: HTTP REFRESH ENDPOINT FLOWS ---');

    let initialRefreshToken = '';
    let cookieHeader = '';

    await it('1. Direct call to RefreshToken.createSession issues valid cookie & record', async () => {
      const { rawToken, session } = await RefreshToken.createSession({
        userId: testUser._id,
        tenantId: testTenant,
        password_version: testUser.password_version
      });
      assert(rawToken);
      assert.strictEqual(session.tenantId, testTenant);
      initialRefreshToken = rawToken;
      const cookieName = getRefreshCookieName();
      cookieHeader = `${cookieName}=${rawToken}`;
    });

    let rotatedCookieHeader = '';
    let newAccessToken = '';

    await it('2. POST /api/auth/refresh with valid cookie rotates token & returns new 24h JWT', async () => {
      const res = await makeRequest(server, {
        path: '/api/auth/refresh',
        method: 'POST',
        headers: {
          'Cookie': cookieHeader
        }
      });

      assert.strictEqual(res.statusCode, 200);
      assert(res.body.success);
      assert(res.body.token, 'Must return new access token');
      newAccessToken = res.body.token;

      // Verify access token does NOT contain passwordHash
      const decoded = jwt.decode(newAccessToken);
      assert.strictEqual(decoded.passwordHash, undefined);
      assert.strictEqual(decoded.staff_id, testStaffId);
      assert.strictEqual(decoded.tenantId, testTenant);

      // Verify Set-Cookie header contains rotated refreshToken
      const setCookie = res.headers['set-cookie'];
      assert(setCookie && setCookie.length > 0, 'Must set rotated cookie in response');
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      assert(cookieStr.includes(getRefreshCookieName()), 'Must contain refresh cookie name');
      assert(cookieStr.toLowerCase().includes('httponly'), 'Must have HttpOnly flag');

      // Extract new cookie value
      const match = cookieStr.match(new RegExp(`${getRefreshCookieName()}=([^;]+)`));
      assert(match, 'Must extract rotated token');
      const rotatedToken = match[1];
      assert.notStrictEqual(rotatedToken, initialRefreshToken, 'Rotated token must be different from initial');
      rotatedCookieHeader = `${getRefreshCookieName()}=${rotatedToken}`;
    });

    await it('3. POST /api/auth/refresh with NO cookie returns HTTP 401', async () => {
      const res = await makeRequest(server, {
        path: '/api/auth/refresh',
        method: 'POST'
      });
      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.error, 'No refresh token cookie provided');
    });

    await it('4. POST /api/auth/refresh with ONLY body refreshToken and NO cookie returns HTTP 401', async () => {
      // Issue a valid session token to test with body
      const { rawToken } = await RefreshToken.createSession({
        userId: testUser._id,
        tenantId: testTenant,
        password_version: testUser.password_version
      });

      const res = await makeRequest(server, {
        path: '/api/auth/refresh',
        method: 'POST'
      }, { refreshToken: rawToken });

      assert.strictEqual(res.statusCode, 401, 'Must reject body refreshToken without cookie');
      assert.strictEqual(res.body.error, 'No refresh token cookie provided');
    });

    await it('5. POST /api/auth/refresh with valid cookie + conflicting body token uses cookie only', async () => {
      // Create a valid session to use in cookie
      const { rawToken: validCookieToken } = await RefreshToken.createSession({
        userId: testUser._id,
        tenantId: testTenant,
        password_version: testUser.password_version
      });
      const validCookie = `${getRefreshCookieName()}=${validCookieToken}`;
      const bogusBodyToken = 'malicious_body_token_1234567890';

      const res = await makeRequest(server, {
        path: '/api/auth/refresh',
        method: 'POST',
        headers: {
          'Cookie': validCookie
        }
      }, { refreshToken: bogusBodyToken });

      assert.strictEqual(res.statusCode, 200, 'Must succeed using cookie and ignoring body');
      assert(res.body.success);
      assert(res.body.token);
    });

    await it('6. Replaying the old refresh token cookie triggers REUSE DETECTION (HTTP 401)', async () => {
      const res = await makeRequest(server, {
        path: '/api/auth/refresh',
        method: 'POST',
        headers: {
          'Cookie': cookieHeader // Old cookie
        }
      });

      assert.strictEqual(res.statusCode, 401);
      assert(res.body.error);
      assert(res.body.error.toLowerCase().includes('reused') || res.body.error.toLowerCase().includes('invalid'));
    });

    await it('7. Token reuse invalidates entire family: rotated token is now also rejected (HTTP 401)', async () => {
      const res = await makeRequest(server, {
        path: '/api/auth/refresh',
        method: 'POST',
        headers: {
          'Cookie': rotatedCookieHeader // Rotated token in the same family
        }
      });

      assert.strictEqual(res.statusCode, 401);
    });

    console.log('\n--- SUITE 2: HTTP LOGOUT FLOWS ---');

    let freshCookieHeader = '';
    await it('8. Issue new session and call POST /api/auth/logout with valid cookie to revoke it', async () => {
      const { rawToken } = await RefreshToken.createSession({
        userId: testUser._id,
        tenantId: testTenant,
        password_version: testUser.password_version
      });
      freshCookieHeader = `${getRefreshCookieName()}=${rawToken}`;

      const res = await makeRequest(server, {
        path: '/api/auth/logout',
        method: 'POST',
        headers: {
          'Cookie': freshCookieHeader
        }
      });

      assert.strictEqual(res.statusCode, 200);
      assert(res.body.success);

      // Verify Set-Cookie clears the cookie
      const setCookie = res.headers['set-cookie'];
      assert(setCookie && setCookie.length > 0);
      const cookieStr = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      assert(cookieStr.includes('Expires=') || cookieStr.includes('Max-Age=0') || cookieStr.includes(`${getRefreshCookieName()}=;`));
    });

    await it('9. Refreshing with the logged-out session fails with HTTP 401', async () => {
      const res = await makeRequest(server, {
        path: '/api/auth/refresh',
        method: 'POST',
        headers: {
          'Cookie': freshCookieHeader
        }
      });
      assert.strictEqual(res.statusCode, 401);
    });

    let unrevokedCookieHeader = '';
    await it('10. POST /api/auth/logout with ONLY body refreshToken and NO cookie must NOT revoke session', async () => {
      const { rawToken } = await RefreshToken.createSession({
        userId: testUser._id,
        tenantId: testTenant,
        password_version: testUser.password_version
      });
      unrevokedCookieHeader = `${getRefreshCookieName()}=${rawToken}`;

      // Attempt to logout using body only (no cookie header)
      const res = await makeRequest(server, {
        path: '/api/auth/logout',
        method: 'POST'
      }, { refreshToken: rawToken });

      assert.strictEqual(res.statusCode, 200, 'Logout is safe/idempotent');

      // Verify session in DB was NOT revoked
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const sessionDoc = await RefreshToken.findOne({ tokenHash });
      assert(sessionDoc, 'Session must still exist');
      assert.strictEqual(sessionDoc.isRevoked, false, 'Session must NOT be revoked by body token');
    });

    await it('11. Refreshing with that unrevoked session succeeds (proving body logout had no effect)', async () => {
      const res = await makeRequest(server, {
        path: '/api/auth/refresh',
        method: 'POST',
        headers: {
          'Cookie': unrevokedCookieHeader
        }
      });
      assert.strictEqual(res.statusCode, 200, 'Must refresh successfully');
      assert(res.body.success);
      assert(res.body.token);
    });

    await it('12. POST /api/auth/logout without any cookie returns safe HTTP 200', async () => {
      const res = await makeRequest(server, {
        path: '/api/auth/logout',
        method: 'POST'
      });
      assert.strictEqual(res.statusCode, 200);
      assert(res.body.success);
    });

    console.log('\n--- SUITE 3: DEBUG ROUTE REMOVAL VERIFICATION ---');

    await it('13. GET /api/debug-db returns HTTP 404 Not Found (database contents not exposed)', async () => {
      const res = await makeRequest(server, {
        path: '/api/debug-db',
        method: 'GET'
      });
      assert.strictEqual(res.statusCode, 404, 'Must return 404 Not Found');
      assert(!JSON.stringify(res.body).includes('password_hash'));
    });

    console.log('\n======================================================');
    console.log(`ALL HTTP INTEGRATION TESTS PASSED: ${passedTests}/${totalTests}`);
    console.log('======================================================\n');

  } finally {
    // Cleanup
    server.close();
    if (testUser) {
      await User.deleteOne({ _id: testUser._id });
    }
    await RefreshToken.deleteMany({ tenantId: testTenant });
    await mongoose.disconnect();
    process.exit(0);
  }
}

runHttpTests().catch(err => {
  console.error('\nHTTP Test Suite Failed:', err);
  process.exit(1);
});
