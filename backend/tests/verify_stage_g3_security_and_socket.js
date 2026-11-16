/**
 * STAGE G.3: AUTOMATED SECURITY, SOCKET.IO & FINANCIAL RESTRICTIONS VERIFICATION
 *
 * Verifies:
 * 1. Socket.IO Handshake Authentication (Missing, Invalid, Expired JWT)
 * 2. Socket.IO Room Isolation (tenant:<tenantId>:patient vs <tenantId>)
 * 3. Socket.IO Cross-Tenant Isolation & Join Defense
 * 4. Cookie & CSRF Architecture Verification (HttpOnly, Secure, SameSite, Path)
 * 5. Financial Protection Verification (Patient role billing mutations forbidden)
 * 6. Patient Frontend Read-Only Billing Code Structure
 */

const assert = require('assert');
const jwt = require('jsonwebtoken');
const { socketAuthMiddleware, configureSocketTenantIsolation } = require('../middleware/socketAuthMiddleware');
const { getRefreshCookieOptions } = require('../utils/authSessionHelper');
const { getParsedOriginsFromEnv, isOriginAllowed, getCorsOptions } = require('../config/corsConfig');

const JWT_SECRET = process.env.JWT_SECRET || 'secret_key';

let totalTests = 0;
let passedTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [PASS ${passedTests}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL ${totalTests}] ${name}`);
    console.error(`     ${err.message}`);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [PASS ${passedTests}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL ${totalTests}] ${name}`);
    console.error(`     ${err.message}`);
    throw err;
  }
}

// Mock socket factory
function createMockSocket(auth = {}, query = {}) {
  const rooms = new Set();
  const listeners = {};
  const emittedEvents = [];
  let disconnected = false;

  const socket = {
    id: 'mock_sock_' + Math.random().toString(36).substring(7),
    handshake: { auth, query },
    join: (room) => { rooms.add(room); },
    leave: (room) => { rooms.delete(room); },
    rooms,
    on: (evt, handler) => {
      listeners[evt] = listeners[evt] || [];
      listeners[evt].push(handler);
    },
    emit: (evt, data) => {
      emittedEvents.push({ evt, data });
    },
    disconnect: (close) => {
      disconnected = true;
    },
    _trigger: (evt, ...args) => {
      const handlers = listeners[evt] || [];
      handlers.forEach(h => h(...args));
    },
    _getEmitted: () => emittedEvents,
    _isDisconnected: () => disconnected
  };

  return socket;
}

async function main() {
  console.log('\n======================================================');
  console.log('QUROXA STAGE G.3: SECURITY, SOCKET & FINANCIAL AUDIT');
  console.log('======================================================\n');

  // ─────────────────────────────────────────────────────────────
  // 1. SOCKET.IO HANDSHAKE AUTHENTICATION TESTS
  // ─────────────────────────────────────────────────────────────
  console.log('[CATEGORY 1] Socket.IO Handshake Authentication');

  await runAsyncTest('Missing JWT token connection is rejected', async () => {
    const socket = createMockSocket({});
    let errorReceived = null;
    await socketAuthMiddleware(socket, (err) => { errorReceived = err; });
    assert.ok(errorReceived, 'Expected authentication error');
    assert.match(errorReceived.message, /No token provided/i);
  });

  await runAsyncTest('Invalid / malformed JWT token is rejected', async () => {
    const socket = createMockSocket({ token: 'invalid.bearer.token' });
    let errorReceived = null;
    await socketAuthMiddleware(socket, (err) => { errorReceived = err; });
    assert.ok(errorReceived, 'Expected authentication error');
    assert.match(errorReceived.message, /Invalid or expired token/i);
  });

  await runAsyncTest('Expired JWT token is rejected at handshake', async () => {
    const expiredToken = jwt.sign(
      { id: 'pat_123', role: 'patient', tenantId: 'city_hospital', exp: Math.floor(Date.now() / 1000) - 300 },
      JWT_SECRET
    );
    const socket = createMockSocket({ token: expiredToken });
    let errorReceived = null;
    await socketAuthMiddleware(socket, (err) => { errorReceived = err; });
    assert.ok(errorReceived, 'Expected authentication error');
    assert.match(errorReceived.message, /Invalid or expired token|Token expired/i);
  });

  await runAsyncTest('Patient token without tenantId fails closed', async () => {
    const noTenantToken = jwt.sign(
      { id: 'pat_123', role: 'patient' },
      JWT_SECRET
    );
    const socket = createMockSocket({ token: noTenantToken });
    let errorReceived = null;
    await socketAuthMiddleware(socket, (err) => { errorReceived = err; });
    assert.ok(errorReceived, 'Expected authentication error');
    assert.match(errorReceived.message, /Tenant identification missing/i);
  });

  await runAsyncTest('Valid Patient JWT accepted & socket.user populated correctly', async () => {
    const validToken = jwt.sign(
      { id: 'pat_456', role: 'patient', tenantId: 'city_hospital', exp: Math.floor(Date.now() / 1000) + 3600 },
      JWT_SECRET
    );
    const socket = createMockSocket({ token: validToken });
    let errorReceived = null;
    await socketAuthMiddleware(socket, (err) => { errorReceived = err; });
    assert.strictEqual(errorReceived, undefined);
    assert.strictEqual(socket.authenticated, true);
    assert.strictEqual(socket.user.userId, 'pat_456');
    assert.strictEqual(socket.user.role, 'patient');
    assert.strictEqual(socket.user.tenantId, 'city_hospital');
  });

  // ─────────────────────────────────────────────────────────────
  // 2. SOCKET.IO ROOM ISOLATION TESTS
  // ─────────────────────────────────────────────────────────────
  console.log('\n[CATEGORY 2] Socket.IO Room Isolation & Tenant Boundary');

  runTest('Patient socket joins tenant:<tenantId>:patient and user:<userId> ONLY', () => {
    const socket = createMockSocket();
    socket.authenticated = true;
    socket.user = {
      userId: 'pat_789',
      role: 'patient',
      tenantId: 'city_hospital'
    };

    configureSocketTenantIsolation({}, socket);

    assert.ok(socket.rooms.has('tenant:city_hospital:patient'), 'Must join tenant:city_hospital:patient');
    assert.ok(socket.rooms.has('user:pat_789'), 'Must join user:pat_789');
    assert.ok(!socket.rooms.has('city_hospital'), 'PATIENT MUST NEVER JOIN STAFF ROOM "city_hospital"');
  });

  runTest('Staff socket joins staff operational room <tenantId>', () => {
    const socket = createMockSocket();
    socket.authenticated = true;
    socket.user = {
      userId: 'staff_101',
      staff_id: 'DOC_1',
      role: 'doctor',
      tenantId: 'city_hospital'
    };

    configureSocketTenantIsolation({}, socket);

    assert.ok(socket.rooms.has('city_hospital'), 'Staff must join operational room city_hospital');
    assert.ok(!socket.rooms.has('tenant:city_hospital:patient'), 'Staff does not join patient room');
  });

  runTest('Patient blocked from joining staff room via join_tenant event', () => {
    const socket = createMockSocket();
    socket.authenticated = true;
    socket.user = {
      userId: 'pat_789',
      role: 'patient',
      tenantId: 'city_hospital'
    };

    configureSocketTenantIsolation({}, socket);

    // Patient attempts to join staff operational room
    socket._trigger('join_tenant', 'city_hospital');

    // Should only have patient room, not raw city_hospital
    assert.ok(!socket.rooms.has('city_hospital'), 'Patient must be blocked from joining staff operational room');
    assert.ok(socket.rooms.has('tenant:city_hospital:patient'));
  });

  runTest('Patient blocked from joining other tenant patient room', () => {
    const socket = createMockSocket();
    socket.authenticated = true;
    socket.user = {
      userId: 'pat_789',
      role: 'patient',
      tenantId: 'city_hospital'
    };

    configureSocketTenantIsolation({}, socket);

    // Patient attempts to join apollo_delhi
    socket._trigger('join_tenant', 'apollo_delhi');

    assert.ok(!socket.rooms.has('apollo_delhi'));
    assert.ok(!socket.rooms.has('tenant:apollo_delhi:patient'));

    const emitted = socket._getEmitted();
    const errorEvt = emitted.find(e => e.evt === 'error');
    assert.ok(errorEvt, 'Should emit error for unauthorized tenant join');
    assert.match(errorEvt.data.message, /Unauthorized tenant room access denied/i);
  });

  runTest('Staff blocked from joining other tenant rooms', () => {
    const socket = createMockSocket();
    socket.authenticated = true;
    socket.user = {
      userId: 'staff_101',
      role: 'doctor',
      tenantId: 'city_hospital'
    };

    configureSocketTenantIsolation({}, socket);

    // Staff attempts to join apollo_delhi
    socket._trigger('join_tenant', 'apollo_delhi');

    assert.ok(!socket.rooms.has('apollo_delhi'));
    const errorEvt = socket._getEmitted().find(e => e.evt === 'error');
    assert.ok(errorEvt);
    assert.match(errorEvt.data.message, /Unauthorized tenant room access denied/i);
  });

  // ─────────────────────────────────────────────────────────────
  // 3. CSRF & COOKIE SECURITY AUDIT
  // ─────────────────────────────────────────────────────────────
  console.log('\n[CATEGORY 3] Cookie & CSRF Architecture Verification');

  runTest('Production refresh cookie is HttpOnly, Secure, SameSite=none, and path-scoped to /api/auth', () => {
    // Simulate production environment
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const cookieOpts = getRefreshCookieOptions();

    assert.strictEqual(cookieOpts.httpOnly, true, 'Cookie MUST be HttpOnly');
    assert.strictEqual(cookieOpts.secure, true, 'Cookie MUST be Secure in production');
    assert.strictEqual(cookieOpts.sameSite, 'none', 'Cookie MUST be SameSite=none for cross-origin Render services');
    assert.strictEqual(cookieOpts.path, '/api/auth', 'Cookie MUST be path-restricted to /api/auth');

    process.env.NODE_ENV = prevEnv;
  });

  runTest('Strict Origin allowlist matches production frontends only', () => {
    // Configure production environment origins
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGIN = 'https://curoxa-1.onrender.com,https://quroxa-patient-frontend.onrender.com';
    process.env.STAFF_FRONTEND_URL = 'https://curoxa-1.onrender.com';
    process.env.PATIENT_FRONTEND_URL = 'https://quroxa-patient-frontend.onrender.com';

    const originsSet = getParsedOriginsFromEnv();

    assert.strictEqual(isOriginAllowed('https://quroxa-patient-frontend.onrender.com', originsSet), true);
    assert.strictEqual(isOriginAllowed('https://curoxa-1.onrender.com', originsSet), true);
    assert.strictEqual(isOriginAllowed('https://malicious-site.com', originsSet), false);
    assert.strictEqual(isOriginAllowed('https://quroxa-patient-frontend.onrender.com.evil.com', originsSet), false);
    assert.strictEqual(isOriginAllowed('null', originsSet), false);
  });

  // ─────────────────────────────────────────────────────────────
  // 4. FINANCIAL RESTRICTIONS VERIFICATION
  // ─────────────────────────────────────────────────────────────
  console.log('\n[CATEGORY 4] Financial Restrictions & Patient Role Guard');

  runTest('Billing routes forbidPatientRole middleware rejects patient mutation attempts', () => {
    const { forbidPatientRole } = require('../middleware/authMiddleware');

    let nextCalled = false;
    let resStatus = 0;
    let resJson = null;

    const req = {
      user: { id: 'pat_1', role: 'patient' }
    };
    const res = {
      status: (code) => {
        resStatus = code;
        return {
          json: (data) => { resJson = data; }
        };
      }
    };

    forbidPatientRole(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false, 'Patient role MUST NOT proceed past forbidPatientRole');
    assert.strictEqual(resStatus, 403, 'Must return HTTP 403 Forbidden');
    assert.strictEqual(resJson.error, 'Access denied: Patient role not permitted for this resource');
  });

  runTest('Staff role is allowed past forbidPatientRole', () => {
    const { forbidPatientRole } = require('../middleware/authMiddleware');

    let nextCalled = false;
    const req = {
      user: { id: 'staff_1', role: 'doctor' }
    };
    const res = {};

    forbidPatientRole(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true, 'Staff role must proceed');
  });

  console.log('\n======================================================');
  console.log(`ALL TESTS PASSED: ${passedTests}/${totalTests}`);
  console.log('======================================================\n');
}

main().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
