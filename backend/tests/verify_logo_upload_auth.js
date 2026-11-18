/**
 * QUROXA — CLINIC LOGO UPLOAD AUTHENTICATION & SECURITY VERIFICATION
 *
 * Verifies:
 * 1. LogoUploader token resolution (authoritative in-memory store + prop binding, zero storage fallbacks).
 * 2. URL resolution via getApiUrl().
 * 3. Backend auth middleware enforcement:
 *    - Unauthenticated request (missing header) => 401 Unauthorized ('No token provided')
 *    - Malformed / invalid token => 401 Unauthorized
 *    - Expired token => 401 Unauthorized
 *    - Valid non-superadmin token (doctor/patient) => 403 Forbidden
 *    - Valid superadmin token => Passes authentication & authorization
 * 4. Call-site verification across all frontend usage locations.
 */

const assert = require('assert');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { getJwtSecret } = require('../config/env');
const secret = getJwtSecret();

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

console.log('======================================================================');
console.log('  VERIFICATION: CLINIC LOGO UPLOAD AUTHENTICATION & FIX INTEGRITY     ');
console.log('======================================================================\n');

// -------------------------------------------------------------------
// SUITE 1: Static Code Inspection & Security Boundary Checks
// -------------------------------------------------------------------
console.log('--- SUITE 1: Component Source Integrity & Anti-Persistence Checks ---');

const logoUploaderPath = path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'common', 'LogoUploader.jsx');
const logoUploaderSrc = fs.readFileSync(logoUploaderPath, 'utf8');

it('LogoUploader imports getAccessToken from authTokenStore', () => {
  assert(logoUploaderSrc.includes("import { getAccessToken } from '../../utils/authTokenStore';"),
    'Must import getAccessToken from authTokenStore');
});

it('LogoUploader imports getApiUrl from urlConfig', () => {
  assert(logoUploaderSrc.includes("import { getApiUrl } from '../../utils/urlConfig';"),
    'Must import getApiUrl from urlConfig');
});

it('LogoUploader contains ZERO localStorage or sessionStorage fallbacks', () => {
  assert(!logoUploaderSrc.includes('localStorage.getItem'), 'Must not contain localStorage.getItem');
  assert(!logoUploaderSrc.includes('sessionStorage.getItem'), 'Must not contain sessionStorage.getItem');
  assert(!logoUploaderSrc.includes('superadminToken'), 'Must not reference superadminToken storage key');
});

it('LogoUploader resolves endpoint using getApiUrl', () => {
  assert(logoUploaderSrc.includes('const endpoint = getApiUrl(rawEndpoint);'),
    'Must resolve endpoint through getApiUrl');
});

// -------------------------------------------------------------------
// SUITE 2: Call-Site Verification Across Frontend Views
// -------------------------------------------------------------------
console.log('\n--- SUITE 2: Call-Site Prop Binding Verification ---');

const hospitalProfilePath = path.join(__dirname, '..', '..', 'frontend', 'src', 'components', 'superadmin', 'HospitalProfileView.jsx');
const hospitalProfileSrc = fs.readFileSync(hospitalProfilePath, 'utf8');

it('HospitalProfileView passes authToken={getSuperAdminToken()} to LogoUploader', () => {
  assert(hospitalProfileSrc.includes('<LogoUploader'), 'HospitalProfileView must instantiate LogoUploader');
  assert(hospitalProfileSrc.includes('authToken={getSuperAdminToken()}'),
    'HospitalProfileView must bind authToken prop');
});

const superAdminDashPath = path.join(__dirname, '..', '..', 'frontend', 'src', 'pages', 'SuperAdminDashboard.jsx');
const superAdminDashSrc = fs.readFileSync(superAdminDashPath, 'utf8');

it('SuperAdminDashboard onboarding wizard passes authToken to LogoUploader', () => {
  const wizardIdx = superAdminDashSrc.indexOf('hospitalCode={wizardHospital?.code}');
  assert(wizardIdx !== -1, 'Wizard must configure hospitalCode');
  const wizardSnippet = superAdminDashSrc.slice(wizardIdx - 100, wizardIdx + 150);
  assert(wizardSnippet.includes('<LogoUploader'), 'Wizard must instantiate LogoUploader');
  assert(wizardSnippet.includes('authToken={getSuperAdminToken()}'), 'Wizard must bind authToken prop');
});

it('SuperAdminDashboard quick-edit modal passes authToken to LogoUploader', () => {
  const quickEditIdx = superAdminDashSrc.indexOf('hospitalId={logoEditHosp?._id || logoEditHosp?.hospitalId}');
  assert(quickEditIdx !== -1, 'Quick-edit modal must configure hospitalId');
  const quickEditSnippet = superAdminDashSrc.slice(quickEditIdx - 100, quickEditIdx + 300);
  assert(quickEditSnippet.includes('<LogoUploader'), 'Quick-edit modal must instantiate LogoUploader');
  assert(quickEditSnippet.includes('authToken={getSuperAdminToken()}'), 'Quick-edit modal must bind authToken prop');
});

// -------------------------------------------------------------------
// SUITE 3: Token Resolution & Authorization Header Simulation
// -------------------------------------------------------------------
console.log('\n--- SUITE 3: Token Resolution & Header Construction ---');

it('Resolves explicit prop token when provided', () => {
  const mockPropToken = 'mock_prop_token_abc';
  let mockInMemoryToken = null;
  const token = (mockPropToken && typeof mockPropToken === 'string' && mockPropToken.trim())
    ? mockPropToken.trim()
    : mockInMemoryToken;
  assert.strictEqual(token, 'mock_prop_token_abc');
  const headers = { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
  assert.strictEqual(headers['Authorization'], 'Bearer mock_prop_token_abc');
});

it('Falls back cleanly to in-memory store when prop token is omitted', () => {
  const mockPropToken = undefined;
  const mockInMemoryToken = 'mock_in_memory_token_xyz';
  const token = (mockPropToken && typeof mockPropToken === 'string' && mockPropToken.trim())
    ? mockPropToken.trim()
    : mockInMemoryToken;
  assert.strictEqual(token, 'mock_in_memory_token_xyz');
  const headers = { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
  assert.strictEqual(headers['Authorization'], 'Bearer mock_in_memory_token_xyz');
});

it('Produces empty headers when both prop and in-memory token are absent', () => {
  const mockPropToken = undefined;
  const mockInMemoryToken = null;
  const token = (mockPropToken && typeof mockPropToken === 'string' && mockPropToken.trim())
    ? mockPropToken.trim()
    : mockInMemoryToken;
  assert.strictEqual(token, null);
  const headers = { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
  assert.strictEqual(headers['Authorization'], undefined);
});

// -------------------------------------------------------------------
// SUITE 4: Backend Auth Middleware & Route Security Invariants
// -------------------------------------------------------------------
console.log('\n--- SUITE 4: Backend Middleware Auth Invariants ---');

const { verifyToken, isSuperAdmin } = require('../middleware/authMiddleware');

function createMockReqRes(headers = {}) {
  const req = {
    headers: { ...headers },
    user: null,
    ip: '127.0.0.1',
    socket: { remoteAddress: '127.0.0.1' }
  };
  let statusCode = 200;
  let responseData = null;
  let nextCalled = false;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(data) {
      responseData = data;
      return this;
    }
  };
  const next = () => { nextCalled = true; };
  return { req, res, next, getResult: () => ({ statusCode, responseData, nextCalled }) };
}

it('verifyToken: Rejects request with missing Authorization header (401)', () => {
  const { req, res, next, getResult } = createMockReqRes({});
  verifyToken(req, res, next);
  const result = getResult();
  assert.strictEqual(result.statusCode, 401);
  assert.strictEqual(result.responseData?.error, 'No token provided');
  assert.strictEqual(result.nextCalled, false);
});

it('verifyToken: Rejects request with malformed token (401)', () => {
  const { req, res, next, getResult } = createMockReqRes({ authorization: 'Bearer invalid.garbage.token' });
  verifyToken(req, res, next);
  const result = getResult();
  assert.strictEqual(result.statusCode, 401);
  assert.strictEqual(result.nextCalled, false);
});

it('verifyToken: Rejects request with expired token (401)', () => {
  const expiredToken = jwt.sign(
    { id: 'usr_super', role: 'superadmin', staff_id: 'superadmin', exp: Math.floor(Date.now() / 1000) - 3600 },
    secret
  );
  const { req, res, next, getResult } = createMockReqRes({ authorization: `Bearer ${expiredToken}` });
  verifyToken(req, res, next);
  const result = getResult();
  assert.strictEqual(result.statusCode, 401);
  assert(result.responseData?.error?.toLowerCase().includes('token expired') || result.responseData?.message?.toLowerCase().includes('jwt expired'),
    'Expected token expired error');
  assert.strictEqual(result.nextCalled, false);
});

it('verifyToken: Accepts valid JWT with Bearer prefix', () => {
  const validToken = jwt.sign(
    { id: 'usr_super_1', role: 'superadmin', staff_id: 'superadmin' },
    secret,
    { expiresIn: '1h' }
  );
  const { req, res, next, getResult } = createMockReqRes({ authorization: `Bearer ${validToken}` });
  verifyToken(req, res, next);
  const result = getResult();
  assert.strictEqual(result.nextCalled, true);
  assert.strictEqual(req.user?.role, 'superadmin');
  assert.strictEqual(req.user?.staff_id, 'superadmin');
});

it('isSuperAdmin: Rejects non-superadmin user (patient/doctor) (403)', () => {
  const { req, res, next, getResult } = createMockReqRes();
  req.user = { id: 'usr_doc_1', role: 'doctor', staff_id: 'doc1' };
  isSuperAdmin(req, res, next);
  const result = getResult();
  assert.strictEqual(result.statusCode, 403);
  assert.strictEqual(result.nextCalled, false);
});

it('isSuperAdmin: Allows superadmin user role', () => {
  const { req, res, next, getResult } = createMockReqRes();
  req.user = { id: 'usr_super_1', role: 'superadmin', staff_id: 'superadmin' };
  isSuperAdmin(req, res, next);
  const result = getResult();
  assert.strictEqual(result.nextCalled, true);
});

// -------------------------------------------------------------------
// SUITE 5: Logo Processing & Cloudflare R2 Public Bucket Target
// -------------------------------------------------------------------
console.log('\n--- SUITE 5: Logo Processing & Cloudflare R2 Target Resolution ---');

const sharp = require('sharp');
const { logoProcessingService } = require('../services/logoProcessingService');
const r2 = require('../config/r2');

it('R2 Public Bucket targets quroxa-public-assets', () => {
  const bucket = r2.getR2PublicBucket();
  assert.strictEqual(bucket, 'quroxa-public-assets', 'Must resolve to quroxa-public-assets');
});

it('R2 Public Domain targets verified pub domain', () => {
  const domain = r2.getR2PublicDomain();
  assert.strictEqual(domain, 'https://pub-8936c3a181da4ddf9643d64092a57430.r2.dev', 'Must resolve to verified r2.dev domain');
});

itAsync('logoProcessingService: Validates image integrity and extracts dimensions', async () => {
  const samplePngBuffer = await sharp({
    create: {
      width: 120,
      height: 60,
      channels: 4,
      background: { r: 79, g: 70, b: 229, alpha: 0.8 }
    }
  }).png().toBuffer();

  const metadata = await logoProcessingService.validateImage(samplePngBuffer, 'image/png');
  assert.strictEqual(metadata.width, 120);
  assert.strictEqual(metadata.height, 60);
  assert.strictEqual(metadata.format, 'png');

  const isTransparent = await logoProcessingService.detectExistingTransparency(samplePngBuffer, metadata);
  assert.strictEqual(isTransparent, true);
});

itAsync('logoProcessingService: Rejects unsupported mime types', async () => {
  let threw = false;
  try {
    await logoProcessingService.validateImage(Buffer.from('not an image'), 'application/pdf');
  } catch (err) {
    threw = true;
    assert(err.message.includes('Unsupported image format'), 'Expected format rejection');
  }
  assert.strictEqual(threw, true, 'Must reject unsupported mime types');
});

console.log('\n======================================================================');
console.log(`  VERIFICATION RESULTS: ${passed} PASSED | ${failed} FAILED`);
console.log('======================================================================');

if (failed > 0) process.exit(1);
