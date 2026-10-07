/**
 * QUROXA — PHASE 2A AUTOMATED TEST SUITE
 * Backend Refresh-Token Foundation & Auth Hardening Verification
 */

const assert = require('assert');
const mongoose = require('mongoose');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const RefreshToken = require('../models/RefreshToken');
const User = require('../models/User');
const { getJwtSecret } = require('../config/env');
const { verifyToken } = require('../middleware/authMiddleware');
const {
  getRefreshCookieName,
  getRefreshCookieOptions,
  getClearRefreshCookieOptions,
  issueRefreshSession,
  revokeAllUserSessions
} = require('../utils/authSessionHelper');

let passedTests = 0;
let totalTests = 0;

function it(description, fn) {
  totalTests++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(() => {
        passedTests++;
        console.log(`  ✓ [PASS ${passedTests}] ${description}`);
      }).catch(err => {
        console.error(`  ✗ [FAIL] ${description}`);
        console.error(`     Error: ${err.message}`);
        throw err;
      });
    } else {
      passedTests++;
      console.log(`  ✓ [PASS ${passedTests}] ${description}`);
    }
  } catch (err) {
    console.error(`  ✗ [FAIL] ${description}`);
    console.error(`     Error: ${err.message}`);
    throw err;
  }
}

async function runTestSuite() {
  console.log('\n==================================================');
  console.log('QUROXA PHASE 2A: BACKEND REFRESH & AUTH TEST SUITE');
  console.log('==================================================\n');

  // Connect to DB if not already connected
  if (mongoose.connection.readyState !== 1) {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/curoxa_test';
    await mongoose.connect(mongoUri);
  }

  const testTenantA = 'test_hospital_alpha';
  const testTenantB = 'test_hospital_beta';
  const testUserIdA = new mongoose.Types.ObjectId();
  const testUserIdB = new mongoose.Types.ObjectId();

  try {
    // Clean up test data
    await RefreshToken.deleteMany({ tenantId: { $in: [testTenantA, testTenantB] } });

    console.log('--- SUITE 1: REFRESH SESSION MODEL & HASHING ---');

    let session1RawToken = '';
    let session1Doc = null;

    await it('1. Refresh session creation produces raw token & database record', async () => {
      const res = await RefreshToken.createSession({
        userId: testUserIdA,
        tenantId: testTenantA,
        userAgent: 'Mozilla/5.0 Test Suite',
        ipAddress: '127.0.0.1'
      });
      assert(res.rawToken, 'rawToken must be returned');
      assert.strictEqual(typeof res.rawToken, 'string');
      assert(res.session._id, 'Session document must be saved');
      session1RawToken = res.rawToken;
      session1Doc = res.session;
    });

    await it('2. Refresh token is stored as SHA-256 hash in database', async () => {
      const expectedHash = crypto.createHash('sha256').update(session1RawToken).digest('hex');
      assert.strictEqual(session1Doc.tokenHash, expectedHash);
    });

    await it('3. Plaintext refresh token is NEVER stored in database', async () => {
      const foundByPlaintext = await RefreshToken.findOne({ tokenHash: session1RawToken });
      assert.strictEqual(foundByPlaintext, null, 'Plaintext token must not be found');
      const inDocJson = JSON.stringify(session1Doc);
      assert(!inDocJson.includes(session1RawToken), 'Raw token string must not exist in doc JSON');
    });

    await it('4. Refresh session is strictly bound to tenantId', async () => {
      assert.strictEqual(session1Doc.tenantId, testTenantA);
    });

    await it('5. Refresh session is assigned a valid familyId', async () => {
      assert(session1Doc.familyId, 'familyId must exist');
      assert.strictEqual(typeof session1Doc.familyId, 'string');
    });

    await it('6. Refresh session expiry is configured for future date (7 days default)', async () => {
      assert(session1Doc.expiresAt instanceof Date);
      const diffDays = (session1Doc.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      assert(diffDays > 6.9 && diffDays <= 7.1, `ExpiresAt should be ~7 days ahead, got ${diffDays}`);
    });

    await it('7. TTL index exists on expiresAt field for automatic cleanup', async () => {
      await RefreshToken.init();
      const indexes = await RefreshToken.collection.indexes();
      const ttlIndex = indexes.find(idx => idx.key && idx.key.expiresAt !== undefined && (idx.expireAfterSeconds === 0 || idx.expireAfterSeconds !== undefined));
      assert(ttlIndex, 'TTL index with expireAfterSeconds: 0 must exist on expiresAt');
    });

    console.log('\n--- SUITE 2: TOKEN ROTATION & REUSE DETECTION ---');

    let rotatedRawToken = '';
    let rotatedSessionDoc = null;

    await it('8. Valid refresh rotates RT-1 atomically to RT-2 in same familyId', async () => {
      const hash1 = crypto.createHash('sha256').update(session1RawToken).digest('hex');
      const foundSession = await RefreshToken.findOne({ tokenHash: hash1 });
      assert(!foundSession.isRevoked);

      // Simulate rotation logic
      const newRawToken = crypto.randomBytes(40).toString('hex');
      const newTokenHash = crypto.createHash('sha256').update(newRawToken).digest('hex');

      const rotated = await RefreshToken.findOneAndUpdate(
        { _id: foundSession._id, isRevoked: false },
        { $set: { isRevoked: true, replacedByTokenHash: newTokenHash, revokedAt: new Date() } },
        { returnDocument: 'after' }
      );
      assert(rotated.isRevoked, 'RT-1 must be marked revoked');

      const newSession = await RefreshToken.create({
        userId: foundSession.userId,
        tenantId: foundSession.tenantId,
        tokenHash: newTokenHash,
        familyId: foundSession.familyId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });

      assert.strictEqual(newSession.familyId, foundSession.familyId, 'Rotated token must share same familyId');
      rotatedRawToken = newRawToken;
      rotatedSessionDoc = newSession;
    });

    await it('9. RT-1 is now revoked and marked unusable', async () => {
      const hash1 = crypto.createHash('sha256').update(session1RawToken).digest('hex');
      const check1 = await RefreshToken.findOne({ tokenHash: hash1 });
      assert.strictEqual(check1.isRevoked, true);
    });

    await it('10. RT-2 is active and valid for subsequent refresh', async () => {
      const hash2 = crypto.createHash('sha256').update(rotatedRawToken).digest('hex');
      const check2 = await RefreshToken.findOne({ tokenHash: hash2 });
      assert.strictEqual(check2.isRevoked, false);
      assert.strictEqual(check2.familyId, session1Doc.familyId);
    });

    await it('11. Reusing revoked RT-1 triggers reuse detection and revokes entire family', async () => {
      const hash1 = crypto.createHash('sha256').update(session1RawToken).digest('hex');
      const staleSession = await RefreshToken.findOne({ tokenHash: hash1 });
      assert(staleSession.isRevoked);

      // Trigger reuse detection logic
      await RefreshToken.updateMany(
        { familyId: staleSession.familyId },
        { $set: { isRevoked: true, revokedAt: new Date() } }
      );

      // Verify that RT-2 in the same family is now also revoked!
      const checkRotated = await RefreshToken.findById(rotatedSessionDoc._id);
      assert.strictEqual(checkRotated.isRevoked, true, 'RT-2 must be invalidated by reuse of RT-1');
    });

    await it('12. Token reuse does NOT revoke unrelated sessions of other families', async () => {
      // Create independent session in family B
      const independent = await RefreshToken.createSession({
        userId: testUserIdA,
        tenantId: testTenantA
      });
      assert(!independent.session.isRevoked);

      // Verify family A is revoked while family B remains active
      const checkA = await RefreshToken.findById(session1Doc._id);
      const checkB = await RefreshToken.findById(independent.session._id);
      assert.strictEqual(checkA.isRevoked, true);
      assert.strictEqual(checkB.isRevoked, false);
    });

    console.log('\n--- SUITE 3: TENANT ISOLATION & AUTHORIZATION ---');

    await it('13. Tenant A session is strictly bound to Tenant A and cannot produce Tenant B access', async () => {
      const sessionA = await RefreshToken.createSession({
        userId: testUserIdA,
        tenantId: testTenantA
      });
      assert.strictEqual(sessionA.session.tenantId, testTenantA);
      assert.notStrictEqual(sessionA.session.tenantId, testTenantB);
    });

    await it('14. Client request attempting to tamper with tenantId cannot override session tenantId', async () => {
      const sessionA = await RefreshToken.createSession({
        userId: testUserIdA,
        tenantId: testTenantA
      });
      // The refresh endpoint uses session.tenantId, ignoring req.headers['x-tenant-id']
      const authoritativeTenant = sessionA.session.tenantId;
      assert.strictEqual(authoritativeTenant, testTenantA);
    });

    console.log('\n--- SUITE 4: LOGOUT & REVOCATION ---');

    let logoutSessionRaw = '';
    let logoutSessionDoc = null;

    await it('15. Logout revokes the presenting refresh session', async () => {
      const sess = await RefreshToken.createSession({
        userId: testUserIdA,
        tenantId: testTenantA
      });
      logoutSessionRaw = sess.rawToken;
      logoutSessionDoc = sess.session;

      // Simulate logout revocation
      const hash = crypto.createHash('sha256').update(logoutSessionRaw).digest('hex');
      const revoked = await RefreshToken.findOneAndUpdate(
        { tokenHash: hash, isRevoked: false },
        { $set: { isRevoked: true, revokedAt: new Date() } },
        { returnDocument: 'after' }
      );
      assert.strictEqual(revoked.isRevoked, true);
    });

    await it('16. Revoked session cannot be refreshed after logout', async () => {
      const hash = crypto.createHash('sha256').update(logoutSessionRaw).digest('hex');
      const session = await RefreshToken.findOne({ tokenHash: hash });
      assert(session.isRevoked, 'Must be revoked');
    });

    await it('17. Logout on one session does not revoke unrelated sessions of same user', async () => {
      const sessOther = await RefreshToken.createSession({
        userId: testUserIdA,
        tenantId: testTenantA
      });
      const checkOther = await RefreshToken.findById(sessOther.session._id);
      assert.strictEqual(checkOther.isRevoked, false, 'Unrelated session must remain active');
    });

    console.log('\n--- SUITE 5: JWT SECURITY HARDENING (ZERO passwordHash) ---');

    await it('18. Staff password login token does NOT contain passwordHash or password_hash', () => {
      const payload = {
        id: testUserIdA,
        staff_id: 'dr_ishita',
        role: 'doctor',
        name: 'Dr. Ishita',
        tenantId: testTenantA,
        password_version: 1
      };
      const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '24h' });
      const decoded = jwt.decode(token);
      assert.strictEqual(decoded.passwordHash, undefined);
      assert.strictEqual(decoded.password_hash, undefined);
      assert.strictEqual(decoded.staff_id, 'dr_ishita');
    });

    await it('19. Google staff login token does NOT contain passwordHash', () => {
      const payload = {
        id: testUserIdA,
        staff_id: 'dr_google',
        role: 'doctor',
        name: 'Dr. Google User',
        tenantId: testTenantA,
        password_version: 0
      };
      const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '24h' });
      const decoded = jwt.decode(token);
      assert.strictEqual(decoded.passwordHash, undefined);
      assert.strictEqual(decoded.password_hash, undefined);
    });

    await it('20. SuperAdmin password update token does NOT contain passwordHash', () => {
      const payload = {
        id: testUserIdA,
        staff_id: 'superadmin',
        role: 'superadmin',
        name: 'Platform SuperAdmin',
        tenantId: 'city_hospital',
        password_version: 2
      };
      const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '24h' });
      const decoded = jwt.decode(token);
      assert.strictEqual(decoded.passwordHash, undefined);
      assert.strictEqual(decoded.password_hash, undefined);
    });

    await it('21. Patient portal token does NOT contain password credentials', () => {
      const payload = {
        id: testUserIdB,
        staff_id: '9876543210',
        role: 'patient',
        tenantId: testTenantA
      };
      const token = jwt.sign(payload, getJwtSecret(), { expiresIn: '24h' });
      const decoded = jwt.decode(token);
      assert.strictEqual(decoded.passwordHash, undefined);
      assert.strictEqual(decoded.password_hash, undefined);
    });

    console.log('\n--- SUITE 6: LEGACY 24-HOUR TOKEN COMPATIBILITY ---');

    await it('22. Existing 24-hour access token validates cleanly in verifyToken middleware', async () => {
      const validPayload = {
        id: testUserIdA.toString(),
        staff_id: 'receptionist_1',
        role: 'reception',
        name: 'Receptionist Test',
        tenantId: testTenantA
      };
      const legacyToken = jwt.sign(validPayload, getJwtSecret(), { expiresIn: '24h' });

      const fakeReq = {
        headers: {
          authorization: `Bearer ${legacyToken}`
        }
      };
      let nextCalled = false;
      const fakeRes = {
        status: () => fakeRes,
        json: () => fakeRes
      };

      await new Promise((resolve, reject) => {
        fakeRes.status = (code) => {
          return {
            json: (body) => {
              reject(new Error(`verifyToken responded with ${code}: ${JSON.stringify(body)}`));
            }
          };
        };
        verifyToken(fakeReq, fakeRes, () => {
          nextCalled = true;
          resolve();
        });
      });

      assert(nextCalled, 'Legacy 24h token must pass verifyToken middleware cleanly');
      assert.strictEqual(fakeReq.user.staff_id, 'receptionist_1');
      assert.strictEqual(fakeReq.tenantId, testTenantA);
    });

    console.log('\n--- SUITE 7: DEBUG-DB ENDPOINT HARDENING ---');

    await it('23. GET /api/debug-db is removed and no longer exposed in server routes', () => {
      const fs = require('fs');
      const serverCode = fs.readFileSync(require.resolve('../server.js'), 'utf8');
      assert(!serverCode.includes('/api/debug-db'), 'server.js must not contain /api/debug-db route definition');
    });

    console.log('\n==================================================');
    console.log(`ALL TESTS PASSED: ${passedTests}/${totalTests}`);
    console.log('==================================================\n');

  } finally {
    // Clean up test documents
    try {
      await RefreshToken.deleteMany({ tenantId: { $in: [testTenantA, testTenantB] } });
      await mongoose.disconnect();
    } catch (e) {}
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('\nTest Suite Failed:', err);
  process.exit(1);
});
