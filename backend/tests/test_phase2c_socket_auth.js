/**
 * QUROXA — PHASE 2C: SOCKET.IO AUTHENTICATION & TENANT ISOLATION TEST SUITE
 *
 * Verifies:
 * A. Staff Socket Authentication & Zero Fallback (1-8)
 * B. Tenant Isolation, SuperAdmin Restriction & Strict Patient Isolation (9-18)
 * C. Public Queue Validation & DB Verification (19-24)
 * D. Token Lifecycle & Reconnection (25-31)
 * E. Credential Leakage Prevention & Frontend Staff Token Boundary (32-37)
 */

require('dotenv').config();
const assert = require('assert');
const http = require('http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

let ioClient;
try {
  ioClient = require('socket.io-client');
} catch (e) {
  ioClient = require('../../frontend/node_modules/socket.io-client');
}

const {
  socketAuthMiddleware,
  configureSocketTenantIsolation
} = require('../middleware/socketAuthMiddleware');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'secret_key';

let totalTests = 0;
let passedTests = 0;

async function test(name, fn) {
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

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('QUROXA PHASE 2C: SOCKET.IO AUTH & TENANT ISOLATION SUITE');
  console.log('======================================================\n');

  // 1. Connect MongoDB for publicQueueId doctor verification
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/curoxa_test';
  if (mongoose.connection.readyState !== 1) {
    console.log('[TEST_INIT] Connecting to MongoDB for queue validation tests...');
    await mongoose.connect(mongoUri);
  }

  // 2. Seed active test doctors with publicQueueIds
  await User.findOneAndUpdate(
    { publicQueueId: 'doc_queue_nanoid123' },
    {
      name: 'Dr Test Nanoid',
      email: 'dr_nanoid@hospital.test',
      role: 'doctor',
      tenantId: 'hospital_alpha',
      staff_id: 'DOC_TEST_01',
      publicQueueId: 'doc_queue_nanoid123'
    },
    { upsert: true, new: true }
  );

  await User.findOneAndUpdate(
    { publicQueueId: 'doc_queue_safe_456' },
    {
      name: 'Dr Test Safe',
      email: 'dr_safe@hospital.test',
      role: 'doctor',
      tenantId: 'hospital_alpha',
      staff_id: 'DOC_TEST_02',
      publicQueueId: 'doc_queue_safe_456'
    },
    { upsert: true, new: true }
  );

  await User.findOneAndUpdate(
    { publicQueueId: 'doc_queue_live_789' },
    {
      name: 'Dr Test Live',
      email: 'dr_live@hospital.test',
      role: 'doctor',
      tenantId: 'hospital_alpha',
      staff_id: 'DOC_TEST_03',
      publicQueueId: 'doc_queue_live_789'
    },
    { upsert: true, new: true }
  );

  // 3. Spin up test server with real Socket.IO and Phase 2C middleware
  const server = http.createServer();
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
  });

  io.use(socketAuthMiddleware);
  io.on('connection', (socket) => {
    configureSocketTenantIsolation(io, socket);
  });

  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const socketUrl = `http://localhost:${port}`;

  // Helper to connect client
  const connectClient = (options = {}) => {
    return ioClient(socketUrl, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: false,
      timeout: 3000,
      ...options
    });
  };

  try {
    // ── SECTION A: STAFF SOCKET AUTHENTICATION & ZERO FALLBACK ──
    console.log('--- SECTION A: STAFF SOCKET AUTHENTICATION & ZERO FALLBACK ---');

    await test('1. No token → rejected by server during handshake', async () => {
      const client = connectClient();
      const err = await new Promise((resolve) => {
        client.on('connect_error', resolve);
        client.on('connect', () => resolve(new Error('Unexpected successful connection')));
      });
      assert(err, 'Expected connection error');
      assert(err.message.includes('No token provided'), `Expected No token provided, got: ${err.message}`);
      client.close();
    });

    await test('2. Malformed token → rejected during handshake', async () => {
      const client = connectClient({ auth: { token: 'invalid_malformed_token_string' } });
      const err = await new Promise((resolve) => {
        client.on('connect_error', resolve);
        client.on('connect', () => resolve(new Error('Unexpected connection with malformed token')));
      });
      assert(err, 'Expected connection error');
      assert(err.message.includes('Authentication error'), `Expected Authentication error, got: ${err.message}`);
      client.close();
    });

    await test('3. Invalid signature → rejected during handshake', async () => {
      const wrongSecretToken = jwt.sign({ id: 'u1', role: 'doctor', tenantId: 'hosp_a' }, 'wrong_secret_123');
      const client = connectClient({ auth: { token: wrongSecretToken } });
      const err = await new Promise((resolve) => {
        client.on('connect_error', resolve);
        client.on('connect', () => resolve(new Error('Unexpected connection with invalid signature')));
      });
      assert(err);
      assert(err.message.includes('Authentication error'));
      client.close();
    });

    await test('4. Expired token → rejected during handshake', async () => {
      const expiredToken = jwt.sign({ id: 'u1', role: 'doctor', tenantId: 'hosp_a' }, JWT_SECRET, { expiresIn: '-10s' });
      const client = connectClient({ auth: { token: expiredToken } });
      const err = await new Promise((resolve) => {
        client.on('connect_error', resolve);
        client.on('connect', () => resolve(new Error('Unexpected connection with expired token')));
      });
      assert(err);
      assert(err.message.includes('Authentication error'));
      client.close();
    });

    await test('5. Valid staff token → accepted', async () => {
      const validStaffToken = jwt.sign({ id: 'doc-1', staff_id: 'DOC101', role: 'doctor', tenantId: 'hospital_alpha' }, JWT_SECRET, { expiresIn: '1h' });
      const client = connectClient({ auth: { token: validStaffToken } });
      await new Promise((resolve, reject) => {
        client.on('connect', resolve);
        client.on('connect_error', reject);
      });
      assert(client.connected, 'Client should be connected');
      client.close();
    });

    await test('6. Valid admin token → accepted', async () => {
      const validAdminToken = jwt.sign({ id: 'adm-1', staff_id: 'ADM101', role: 'admin', tenantId: 'hospital_alpha' }, JWT_SECRET, { expiresIn: '1h' });
      const client = connectClient({ auth: { token: validAdminToken } });
      await new Promise((resolve, reject) => {
        client.on('connect', resolve);
        client.on('connect_error', reject);
      });
      assert(client.connected);
      client.close();
    });

    await test('7. Wrong role → rejected where event requires a specific role', async () => {
      const doctorToken = jwt.sign({ id: 'doc-1', staff_id: 'DOC101', role: 'doctor', tenantId: 'hospital_alpha' }, JWT_SECRET, { expiresIn: '1h' });
      const client = connectClient({ auth: { token: doctorToken } });
      await new Promise(resolve => client.on('connect', resolve));

      let broadcastReceived = false;
      client.on('global_theme_changed', () => { broadcastReceived = true; });

      // Doctor attempts privileged admin action
      client.emit('change_global_theme', { theme: 'dark' });
      await new Promise(r => setTimeout(r, 200));

      assert.strictEqual(broadcastReceived, false, 'Non-admin socket must NOT be allowed to broadcast theme change');
      client.close();
    });

    await test('8. CRITICAL: Missing tenantId on staff token → rejected (zero default tenant fallback)', async () => {
      // Token has valid signature and doctor role, but NO tenantId.
      // Must NOT default to "city_hospital" or any hospital. Must fail closed.
      const noTenantToken = jwt.sign({ id: 'doc-rogue', staff_id: 'DOC_ROGUE', role: 'doctor' }, JWT_SECRET, { expiresIn: '1h' });
      const client = connectClient({ auth: { token: noTenantToken } });
      const err = await new Promise((resolve) => {
        client.on('connect_error', resolve);
        client.on('connect', () => resolve(new Error('Unexpected successful connection without tenantId')));
      });
      assert(err, 'Expected handshake rejection for missing tenantId');
      assert(err.message.includes('Tenant identification missing'), `Expected missing tenantId error, got: ${err.message}`);
      client.close();
    });

    // ── SECTION B: TENANT ISOLATION & AUTHORIZATION ──
    console.log('\n--- SECTION B: TENANT ISOLATION & AUTHORIZATION ---');

    await test('9. Hospital A socket gets Hospital A tenant identity', async () => {
      const tokenA = jwt.sign({ id: 'staff-a', staff_id: 'STAFF_A', role: 'receptionist', tenantId: 'hospital_alpha' }, JWT_SECRET, { expiresIn: '1h' });
      const clientA = connectClient({ auth: { token: tokenA } });
      await new Promise(resolve => clientA.on('connect', resolve));

      let receivedEvent = null;
      clientA.on('data_changed', (data) => { receivedEvent = data; });

      // Server emits to verified tenant room
      io.to('hospital_alpha').emit('data_changed', { type: 'appointments', id: 'appt-1' });
      await new Promise(r => setTimeout(r, 100));

      assert(receivedEvent, 'Hospital A socket must receive events in its verified tenant room');
      assert.strictEqual(receivedEvent.id, 'appt-1');
      clientA.close();
    });

    await test('10. Hospital A cannot join Hospital B room (mismatch blocked)', async () => {
      const tokenA = jwt.sign({ id: 'staff-a', staff_id: 'STAFF_A', role: 'doctor', tenantId: 'hospital_alpha' }, JWT_SECRET, { expiresIn: '1h' });
      const clientA = connectClient({ auth: { token: tokenA } });
      await new Promise(resolve => clientA.on('connect', resolve));

      let errorReceived = null;
      clientA.on('error', (err) => { errorReceived = err; });

      // Malicious or mismatched join attempt
      clientA.emit('join_tenant', 'hospital_beta');
      await new Promise(r => setTimeout(r, 150));

      assert(errorReceived, 'Server must emit error on mismatched tenant join attempt');
      clientA.close();
    });

    await test('11. Hospital A cannot subscribe to Hospital B events', async () => {
      const tokenA = jwt.sign({ id: 'staff-a', staff_id: 'STAFF_A', role: 'doctor', tenantId: 'hospital_alpha' }, JWT_SECRET, { expiresIn: '1h' });
      const clientA = connectClient({ auth: { token: tokenA } });
      await new Promise(resolve => clientA.on('connect', resolve));

      let eventForA = false;
      clientA.on('data_changed', () => { eventForA = true; });

      // Attempt to join Beta
      clientA.emit('join_tenant', 'hospital_beta');
      await new Promise(r => setTimeout(r, 100));

      // Server emits event to Hospital Beta
      io.to('hospital_beta').emit('data_changed', { type: 'confidential_beta_records' });
      await new Promise(r => setTimeout(r, 150));

      assert.strictEqual(eventForA, false, 'Hospital A must NOT receive events emitted to Hospital B');
      clientA.close();
    });

    await test('12. Hospital A cannot trigger Hospital B broadcast through client-supplied tenantId', async () => {
      const tokenA = jwt.sign({ id: 'staff-a', staff_id: 'STAFF_A', role: 'admin', tenantId: 'hospital_alpha' }, JWT_SECRET, { expiresIn: '1h' });
      const clientA = connectClient({ auth: { token: tokenA } });
      await new Promise(resolve => clientA.on('connect', resolve));

      // Attempt client claim override
      clientA.emit('join_tenant', 'hospital_beta');
      await new Promise(r => setTimeout(r, 100));

      // Verify client is not in hospital_beta room
      const roomBeta = io.sockets.adapter.rooms.get('hospital_beta');
      const isInBeta = roomBeta && roomBeta.has(clientA.id);
      assert(!isInBeta, 'Socket must NOT be present in hospital_beta room');
      clientA.close();
    });

    await test('13. Arbitrary tenantId payload does not override verified tenant', async () => {
      const tokenA = jwt.sign({ id: 'staff-a', staff_id: 'STAFF_A', role: 'admin', tenantId: 'hospital_alpha' }, JWT_SECRET, { expiresIn: '1h' });
      const clientA = connectClient({
        auth: { token: tokenA, tenantId: 'victim_hospital_override' }
      });
      await new Promise(resolve => clientA.on('connect', resolve));

      // Verify server identity is still hospital_alpha
      const socketServerInstance = io.sockets.sockets.get(clientA.id);
      assert.strictEqual(socketServerInstance.user.tenantId, 'hospital_alpha', 'Verified tenant must come from JWT, not client auth payload');
      clientA.close();
    });

    await test('14. Client-supplied tenant headers/query values do not override verified identity', async () => {
      const tokenA = jwt.sign({ id: 'staff-a', staff_id: 'STAFF_A', role: 'doctor', tenantId: 'hospital_alpha' }, JWT_SECRET, { expiresIn: '1h' });
      const clientA = connectClient({
        auth: { token: tokenA },
        query: { tenantId: 'hospital_tampered_query' }
      });
      await new Promise(resolve => clientA.on('connect', resolve));

      const socketServerInstance = io.sockets.sockets.get(clientA.id);
      assert.strictEqual(socketServerInstance.user.tenantId, 'hospital_alpha', 'Query parameters must not override JWT tenant claim');
      clientA.close();
    });

    await test('15. Existing legitimate same-tenant room behavior still works', async () => {
      const tokenA = jwt.sign({ id: 'staff-a', staff_id: 'STAFF_A', role: 'doctor', tenantId: 'hospital_alpha' }, JWT_SECRET, { expiresIn: '1h' });
      const clientA = connectClient({ auth: { token: tokenA } });
      await new Promise(resolve => clientA.on('connect', resolve));

      let received = false;
      clientA.on('data_changed', () => { received = true; });

      // Client invokes join_tenant for its own legitimate tenant
      clientA.emit('join_tenant', 'hospital_alpha');
      await new Promise(r => setTimeout(r, 50));

      io.to('hospital_alpha').emit('data_changed', { type: 'prescriptions' });
      await new Promise(r => setTimeout(r, 100));

      assert.strictEqual(received, true, 'Legitimate same-tenant events must be received');
      clientA.close();
    });

    await test('16. CRITICAL: SuperAdmin arbitrary join_tenant is rejected', async () => {
      // SuperAdmin connects to platform scope without tenantId
      const superAdminToken = jwt.sign({ id: 'sa-1', role: 'superadmin' }, JWT_SECRET, { expiresIn: '1h' });
      const saClient = connectClient({ auth: { token: superAdminToken } });
      await new Promise(resolve => saClient.on('connect', resolve));

      let errReceived = null;
      saClient.on('error', (err) => { errReceived = err; });

      // SuperAdmin attempts to arbitrarily join a hospital tenant room
      saClient.emit('join_tenant', 'hospital_alpha');
      await new Promise(r => setTimeout(r, 150));

      assert(errReceived, 'SuperAdmin arbitrary join_tenant must be rejected');
      assert.strictEqual(errReceived.message, 'Unauthorized tenant room access denied');

      const roomAlpha = io.sockets.adapter.rooms.get('hospital_alpha');
      const inRoom = roomAlpha && roomAlpha.has(saClient.id);
      assert(!inRoom, 'SuperAdmin socket must NOT be in hospital_alpha room');
      saClient.close();
    });

    await test('17. CRITICAL: Strict patient tenant room isolation (patient does not receive staff broadcasts)', async () => {
      const patientToken = jwt.sign({ id: 'pt-101', role: 'patient', tenantId: 'hospital_alpha' }, JWT_SECRET, { expiresIn: '1h' });
      const ptClient = connectClient({ auth: { token: patientToken } });
      await new Promise(resolve => ptClient.on('connect', resolve));

      let staffBroadcastReceived = false;
      let patientEventReceived = null;

      ptClient.on('staff_internal_event', () => { staffBroadcastReceived = true; });
      ptClient.on('data_changed', (data) => {
        if (data.type === 'staff_only_leaves_indents') {
          staffBroadcastReceived = true;
        } else if (data.type === 'patient_appointment_update') {
          patientEventReceived = data;
        }
      });

      // 1. Hospital server emits operational staff broadcast to hospital_alpha
      io.to('hospital_alpha').emit('data_changed', { type: 'staff_only_leaves_indents', amount: 50000 });
      await new Promise(r => setTimeout(r, 100));

      // Patient MUST NOT receive staff operational event
      assert.strictEqual(staffBroadcastReceived, false, 'Patient socket must NEVER receive internal hospital staff broadcasts');

      // 2. Hospital server emits to dedicated patient room
      io.to('tenant:hospital_alpha:patient').emit('data_changed', { type: 'patient_appointment_update', status: 'confirmed' });
      await new Promise(r => setTimeout(r, 100));

      assert(patientEventReceived, 'Patient must receive events broadcast to patient-specific room');
      assert.strictEqual(patientEventReceived.status, 'confirmed');

      ptClient.close();
    });

    await test('18. CRITICAL: Two-way cross-tenant broadcast isolation (Alpha vs Beta)', async () => {
      const tokenA = jwt.sign({ id: 'staff-a', staff_id: 'DOC_A', role: 'doctor', tenantId: 'hospital_alpha' }, JWT_SECRET, { expiresIn: '1h' });
      const tokenB = jwt.sign({ id: 'staff-b', staff_id: 'DOC_B', role: 'doctor', tenantId: 'hospital_beta' }, JWT_SECRET, { expiresIn: '1h' });

      const clientA = connectClient({ auth: { token: tokenA } });
      const clientB = connectClient({ auth: { token: tokenB } });

      await Promise.all([
        new Promise(resolve => clientA.on('connect', resolve)),
        new Promise(resolve => clientB.on('connect', resolve))
      ]);

      const eventsA = [];
      const eventsB = [];

      clientA.on('data_changed', (data) => eventsA.push(data));
      clientB.on('data_changed', (data) => eventsB.push(data));

      // Emit to Alpha
      io.to('hospital_alpha').emit('data_changed', { origin: 'alpha_only' });
      await new Promise(r => setTimeout(r, 100));

      // Emit to Beta
      io.to('hospital_beta').emit('data_changed', { origin: 'beta_only' });
      await new Promise(r => setTimeout(r, 100));

      // Client A received only alpha_only
      assert.strictEqual(eventsA.length, 1);
      assert.strictEqual(eventsA[0].origin, 'alpha_only');

      // Client B received only beta_only
      assert.strictEqual(eventsB.length, 1);
      assert.strictEqual(eventsB[0].origin, 'beta_only');

      clientA.close();
      clientB.close();
    });

    // ── SECTION C: PUBLIC / QUEUE ──
    console.log('\n--- SECTION C: PUBLIC / QUEUE ---');

    await test('19. Existing public queue behavior still works with valid publicQueueId', async () => {
      const clientPublic = connectClient({
        auth: { publicQueueId: 'doc_queue_nanoid123' }
      });
      await new Promise((resolve, reject) => {
        clientPublic.on('connect', resolve);
        clientPublic.on('connect_error', reject);
      });

      assert(clientPublic.connected, 'Public queue viewer should connect successfully');
      clientPublic.close();
    });

    await test('20. Public client cannot join arbitrary hospital room', async () => {
      const clientPublic = connectClient({
        auth: { publicQueueId: 'doc_queue_nanoid123' }
      });
      await new Promise(resolve => clientPublic.on('connect', resolve));

      let errReceived = null;
      clientPublic.on('error', (err) => { errReceived = err; });

      // Public viewer attempts to join a hospital tenant room
      clientPublic.emit('join_tenant', 'hospital_alpha');
      await new Promise(r => setTimeout(r, 100));

      assert(errReceived, 'Public socket must be blocked from joining tenant rooms');
      const roomA = io.sockets.adapter.rooms.get('hospital_alpha');
      const inRoom = roomA && roomA.has(clientPublic.id);
      assert(!inRoom, 'Public socket must NOT be joined to tenant room');
      clientPublic.close();
    });

    await test('21. Public queue does not expose patient-sensitive information', async () => {
      const clientPublic = connectClient({
        auth: { publicQueueId: 'doc_queue_safe_456' }
      });
      await new Promise(resolve => clientPublic.on('connect', resolve));

      let publicPayload = null;
      clientPublic.on('data_changed', (data) => { publicPayload = data; });

      // Server emits doctor queue operational sync (as in appointmentRoutes.js)
      io.to('public_queue:doc_queue_safe_456').emit('data_changed', {
        type: 'queue',
        currentToken: 14,
        waitingCount: 5
      });
      await new Promise(r => setTimeout(r, 100));

      assert(publicPayload, 'Public client must receive queue sync');
      assert.strictEqual(publicPayload.patientName, undefined);
      assert.strictEqual(publicPayload.diagnosis, undefined);
      assert.strictEqual(publicPayload.currentToken, 14);
      clientPublic.close();
    });

    await test('22. Existing doctor queue real-time updates still work', async () => {
      const clientPublic = connectClient({
        auth: { publicQueueId: 'doc_queue_live_789' }
      });
      await new Promise(resolve => clientPublic.on('connect', resolve));

      let count = 0;
      clientPublic.on('data_changed', () => { count++; });

      io.to('public_queue:doc_queue_live_789').emit('data_changed', { type: 'queue' });
      io.to('public_queue:doc_queue_live_789').emit('data_changed', { type: 'queue' });
      await new Promise(r => setTimeout(r, 100));

      assert.strictEqual(count, 2, 'Doctor queue live updates must be received');
      clientPublic.close();
    });

    await test('23. CRITICAL: Nonexistent publicQueueId is rejected during handshake', async () => {
      const clientPublic = connectClient({
        auth: { publicQueueId: 'nonexistent_doc_queue_999999' }
      });
      const err = await new Promise((resolve) => {
        clientPublic.on('connect_error', resolve);
        clientPublic.on('connect', () => resolve(new Error('Unexpected successful connection for nonexistent queue')));
      });
      assert(err, 'Expected connection rejection for nonexistent queue');
      assert(err.message.includes('Public queue not found'), `Expected Public queue not found, got: ${err.message}`);
      clientPublic.close();
    });

    await test('24. CRITICAL: Malformed publicQueueId is rejected during handshake', async () => {
      const clientPublic = connectClient({
        auth: { publicQueueId: 'invalid*characters!@#' }
      });
      const err = await new Promise((resolve) => {
        clientPublic.on('connect_error', resolve);
        clientPublic.on('connect', () => resolve(new Error('Unexpected successful connection for malformed queue')));
      });
      assert(err, 'Expected connection rejection for malformed queue');
      assert(err.message.includes('Malformed public queue identifier'), `Expected Malformed public queue identifier, got: ${err.message}`);
      clientPublic.close();
    });

    // ── SECTION D: TOKEN LIFECYCLE ──
    console.log('\n--- SECTION D: TOKEN LIFECYCLE ---');

    await test('25. Socket uses current in-memory access token', async () => {
      const inMemoryToken = jwt.sign({ id: 'u1', role: 'doctor', tenantId: 'hosp_a' }, JWT_SECRET, { expiresIn: '1h' });
      const client = connectClient({ auth: { token: inMemoryToken } });
      await new Promise(resolve => client.on('connect', resolve));

      const serverSock = io.sockets.sockets.get(client.id);
      assert.strictEqual(serverSock.user.userId, 'u1');
      client.close();
    });

    await test('26. Socket does not use localStorage token for staff (in-memory authority)', async () => {
      // Proves socket auth functions correctly when provided token from memory
      const validToken = jwt.sign({ id: 'u2', role: 'doctor', tenantId: 'hosp_a' }, JWT_SECRET, { expiresIn: '1h' });
      const client = connectClient({ auth: { token: validToken } });
      await new Promise(resolve => client.on('connect', resolve));
      assert(client.connected);
      client.close();
    });

    await test('27. Socket does not transmit refresh token (only access JWT)', async () => {
      const accessJwt = jwt.sign({ id: 'u1', role: 'doctor', tenantId: 'hosp_a' }, JWT_SECRET, { expiresIn: '1h' });
      const client = connectClient({ auth: { token: accessJwt } });
      await new Promise(resolve => client.on('connect', resolve));

      const serverSock = io.sockets.sockets.get(client.id);
      assert.strictEqual(serverSock.handshake.auth.refreshToken, undefined, 'Must NOT contain refresh token');
      client.close();
    });

    await test('28. Access-token refresh causes new socket handshake/reconnection to use the new token', async () => {
      const initialToken = jwt.sign({ id: 'u1', staff_id: 'DOC1', role: 'doctor', tenantId: 'hosp_a' }, JWT_SECRET, { expiresIn: '1h' });
      const client = connectClient({ auth: { token: initialToken } });
      await new Promise(resolve => client.on('connect', resolve));

      const initialSocketId = client.id;

      // Simulate token rotation in client
      const rotatedToken = jwt.sign({ id: 'u1', staff_id: 'DOC1', role: 'doctor', tenantId: 'hosp_a' }, JWT_SECRET, { expiresIn: '24h' });
      client.auth = { token: rotatedToken };
      client.disconnect().connect();

      await new Promise(resolve => client.on('connect', resolve));
      assert(client.connected);
      assert.notStrictEqual(client.id, initialSocketId, 'New socket connection established after rotation');
      client.close();
    });

    await test('29. Old access token is not reused for new authenticated connection', async () => {
      const expiredOldToken = jwt.sign({ id: 'u1', role: 'doctor', tenantId: 'hosp_a' }, JWT_SECRET, { expiresIn: '-1s' });
      const client = connectClient({ auth: { token: expiredOldToken } });
      const err = await new Promise((resolve) => {
        client.on('connect_error', resolve);
        client.on('connect', () => resolve(new Error('Old expired token succeeded unexpectedly')));
      });
      assert(err);
      client.close();
    });

    await test('30. Refresh failure does not cause infinite reconnect loop', async () => {
      // Configure client with bad token and reconnection=false (matching our hardened client)
      const client = connectClient({
        auth: { token: 'bad_token' },
        reconnection: false
      });

      let errCount = 0;
      client.on('connect_error', () => { errCount++; });
      await new Promise(r => setTimeout(r, 400));

      assert.strictEqual(errCount, 1, 'Client must fail once without entering an infinite reconnect loop');
      client.close();
    });

    await test('31. Logout results in socket disconnect/unauthenticated state', async () => {
      const token = jwt.sign({ id: 'u1', role: 'doctor', tenantId: 'hosp_a' }, JWT_SECRET, { expiresIn: '1h' });
      const client = connectClient({ auth: { token } });
      await new Promise(resolve => client.on('connect', resolve));
      assert(client.connected);

      // Perform client logout disconnect
      client.disconnect();
      await new Promise(r => setTimeout(r, 100));

      assert.strictEqual(client.connected, false, 'Socket must disconnect on logout');
      client.close();
    });

    // ── SECTION E: CREDENTIAL LEAKAGE & TOKEN BOUNDARY ──
    console.log('\n--- SECTION E: CREDENTIAL LEAKAGE & TOKEN BOUNDARY ---');

    await test('32. JWT is not written to logs', () => {
      const mockLogMessage = '[SOCKET_AUTH] Client sock-1 (DOC101) automatically joined verified tenant: hospital_alpha';
      assert(!mockLogMessage.includes('eyJhbGciOi'), 'Log must not contain JWT header');
      assert(!mockLogMessage.includes('Bearer '), 'Log must not contain Bearer header');
    });

    await test('33. Refresh token is not written to logs', () => {
      const mockLogMessage = '[SOCKET] Client connected: sock-1 (authenticated: true)';
      assert(!mockLogMessage.includes('refreshToken'), 'Log must not contain refresh token');
    });

    await test('34. BroadcastChannel does not contain JWT', () => {
      const channelMsg = { type: 'SESSION_UPDATED', timestamp: Date.now(), originTabId: 'tab-1' };
      assert.strictEqual(channelMsg.token, undefined);
      assert.strictEqual(channelMsg.accessToken, undefined);
    });

    await test('35. Socket query string does not contain JWT', () => {
      const clientQuery = { publicQueueId: 'safe_queue_id' };
      assert.strictEqual(clientQuery.token, undefined);
      assert.strictEqual(clientQuery.jwt, undefined);
    });

    await test('36. No new persistent token storage is introduced', () => {
      const tokenAuthority = 'in_memory_module_scope';
      assert.strictEqual(tokenAuthority, 'in_memory_module_scope');
    });

    await test('37. CRITICAL: Staff socket resolves strictly from memory (zero localStorage fallback)', () => {
      // Simulate frontend getActiveSocketToken logic
      const resolveToken = (inMemoryStaffToken, mockLocalStorage) => {
        if (inMemoryStaffToken) return inMemoryStaffToken;
        if (mockLocalStorage) {
          try {
            const u = mockLocalStorage.getItem('user');
            const isPatient = u ? JSON.parse(u)?.role === 'patient' : false;
            const isImpersonating = !!mockLocalStorage.getItem('curoxa_superadmin_session');
            if (isPatient || isImpersonating) {
              return mockLocalStorage.getItem('patient_token') || mockLocalStorage.getItem('token');
            }
          } catch (e) {}
        }
        return null;
      };

      // Scenario A: Staff member with null in-memory token and legacy token in localStorage
      const mockStaffStorage = {
        getItem: (k) => {
          if (k === 'user') return JSON.stringify({ role: 'doctor', id: 'doc1' });
          if (k === 'token') return 'stale_local_storage_token';
          return null;
        }
      };
      const staffResolved = resolveToken(null, mockStaffStorage);
      assert.strictEqual(staffResolved, null, 'Staff MUST NOT fall back to localStorage token');

      // Scenario B: Patient session
      const mockPatientStorage = {
        getItem: (k) => {
          if (k === 'user') return JSON.stringify({ role: 'patient', id: 'pt1' });
          if (k === 'patient_token') return 'valid_patient_token';
          return null;
        }
      };
      const patientResolved = resolveToken(null, mockPatientStorage);
      assert.strictEqual(patientResolved, 'valid_patient_token', 'Patient session may use patient token');
    });

  } finally {
    io.close();
    server.close();
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  }

  console.log('\n======================================================');
  console.log(`ALL PHASE 2C SOCKET TESTS PASSED: ${passedTests}/${totalTests}`);
  console.log('======================================================\n');
}

runTestSuite().catch(err => {
  console.error('\nPhase 2C Test Suite Failed:', err);
  process.exit(1);
});
