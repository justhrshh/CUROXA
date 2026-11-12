/**
 * QUROXA LOCAL CONTROLLED PING4SMS LIVE TEST PREPARATION AUDIT
 * 
 * Verifies local readiness for manual controlled SMS testing:
 * 1. All 5 PING4SMS environment variables loaded properly from local backend .env
 * 2. Confirmed legacy PING4SMS configuration matches exactly:
 *    - Endpoint: https://site.ping4sms.com/api/smsapi
 *    - Method: GET
 *    - Route: 2
 *    - Sender ID: PNGOTP
 *    - Template ID: 1507165967974501361
 *    - Message pattern: Dear Customer,{#var#} is your verification code -PNGOTP
 * 3. Local frontend points to local backend (http://localhost:5000/api)
 * 4. Staging database target isolation
 * 5. Patient Portal SMS support
 * 6. Zero automated test sends real SMS
 * 7. Strict secret & query parameter redaction
 * 8. Zero automatic dispatch (no real SMS sent during audit)
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load backend .env directly
const backendEnvPath = path.join(__dirname, '../.env');
const envConfig = dotenv.parse(fs.readFileSync(backendEnvPath));

// Apply to process.env for service inspection
Object.keys(envConfig).forEach(key => {
  process.env[key] = envConfig[key];
});

const {
  getPing4smsConfig,
  buildPing4smsRequest,
  getSanitizedUrl,
  sanitizeSecret,
  REGISTERED_TEMPLATE_PATTERN
} = require('../services/sms/ping4smsService');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

console.log('===================================================================');
console.log('QUROXA — LOCAL PING4SMS READINESS & ENVIRONMENT AUDIT');
console.log('===================================================================\n');

// 1. Verify 5 PING4SMS Environment Variables
console.log('[CHECK 1] Local Backend PING4SMS Environment Variables');
const cfg = getPing4smsConfig();

assert(Boolean(cfg.apiKey && cfg.apiKey.length >= 16), 'PING4SMS_API_KEY is present, loaded, and valid format (redacted)');
assert(cfg.apiUrl === 'https://site.ping4sms.com/api/smsapi', 'PING4SMS_API_URL matches confirmed legacy endpoint (https://site.ping4sms.com/api/smsapi)');
assert(cfg.route === '2', 'PING4SMS_ROUTE is set to 2 (Transactional)');
assert(cfg.senderId === 'PNGOTP', 'PING4SMS_SENDER_ID is set to PNGOTP');
assert(cfg.templateId === '1507165967974501361', 'PING4SMS_TEMPLATE_ID is set to 1507165967974501361');

// 2. Verify Exact Registered Template & Parameter Binding
console.log('\n[CHECK 2] DLT Template Fidelity & Parameter Binding Contract');
assert(
  REGISTERED_TEMPLATE_PATTERN === 'Dear Customer,{#var#} is your verification code -PNGOTP',
  'Exact registered DLT template wording is preserved'
);

const sampleReq = buildPing4smsRequest({
  mobile: '9876543210',
  otp: '556677',
  config: cfg
});

assert(sampleReq.method === 'GET', 'HTTP method is strictly GET');
assert(sampleReq.parsedUrl.searchParams.get('key') === cfg.apiKey, 'Request binds parameter: key');
assert(sampleReq.parsedUrl.searchParams.get('route') === '2', 'Request binds parameter: route=2');
assert(sampleReq.parsedUrl.searchParams.get('sender') === 'PNGOTP', 'Request binds parameter: sender=PNGOTP');
assert(sampleReq.parsedUrl.searchParams.get('number') === '9876543210', 'Request binds parameter: number (10-digit normalized)');
assert(sampleReq.parsedUrl.searchParams.get('sms') === 'Dear Customer,556677 is your verification code -PNGOTP', 'Request binds parameter: sms (only OTP substituted)');
assert(sampleReq.parsedUrl.searchParams.get('templateid') === '1507165967974501361', 'Request binds parameter: templateid=1507165967974501361');

// 3. Verify Local Frontend Configuration Points to Local Backend
console.log('\n[CHECK 3] Local Frontend Target Resolution');
const frontendEnvPath = path.join(__dirname, '../../frontend/.env');
const frontendEnv = dotenv.parse(fs.readFileSync(frontendEnvPath));

assert(
  frontendEnv.VITE_API_URL === 'http://localhost:5000/api',
  'Frontend .env points directly to local backend: http://localhost:5000/api'
);

const viteConfigPath = path.join(__dirname, '../../frontend/vite.config.js');
const viteContent = fs.readFileSync(viteConfigPath, 'utf8');
assert(
  viteContent.includes("target: process.env.VITE_BACKEND_URL || 'http://localhost:5000'"),
  'Vite dev server proxies /api to local backend port 5000'
);

// 4. Verify Staging Database Target Isolation
console.log('\n[CHECK 4] Backend Staging Database Configuration');
assert(Boolean(process.env.MONGO_URI), 'MONGO_URI is defined in local backend .env');
assert(!process.env.MONGO_URI.toLowerCase().includes('prod'), 'Database connection string does not reference production DB');
assert(process.env.NODE_ENV === 'development', 'NODE_ENV is set to development (local staging environment)');

// 5. Confirm Patient Portal Supports SMS OTP Delivery
console.log('\n[CHECK 5] Patient Portal SMS OTP Delivery Architecture');
const authRoutesPath = path.join(__dirname, '../routes/authRoutes.js');
const authContent = fs.readFileSync(authRoutesPath, 'utf8');

assert(
  authContent.includes("const deliveryChannel = (phoneCheck.isValid && !isEmail) ? 'sms' : 'email';"),
  'authRoutes detects normalized Indian phone numbers and routes channel to sms'
);
assert(
  authContent.includes("purpose: 'PATIENT_PORTAL_AUTH'"),
  'authRoutes binds Patient Portal OTPs to purpose PATIENT_PORTAL_AUTH'
);

const portalLoginPath = path.join(__dirname, '../../frontend/src/pages/PatientPortalLogin.jsx');
const portalContent = fs.readFileSync(portalLoginPath, 'utf8');
assert(
  portalContent.includes("api.post('/auth/patient-portal/send-otp'"),
  'PatientPortalLogin.jsx submits to /auth/patient-portal/send-otp'
);
assert(
  portalContent.includes("multiple_profiles") && portalContent.includes("/patient-portal/select-profile"),
  'PatientPortalLogin.jsx supports multi-patient disambiguation (SEC-02)'
);

// 6. Confirm Zero Automated Tests Send Real SMS
console.log('\n[CHECK 6] Automated Test Safety & Zero Real SMS Guarantee');
const testFiles = fs.readdirSync(path.join(__dirname, '../tests'));
let foundUnmockedSmsCall = false;

testFiles.forEach(file => {
  if (file.endsWith('.js') && file.startsWith('test_')) {
    const content = fs.readFileSync(path.join(__dirname, '../tests', file), 'utf8');
    if (content.includes('sendOtpSms(') && !content.includes('_mockTransport') && !content.includes('_mockHttpRequest') && !content.includes('_mockSmsTransport')) {
      console.warn(`Potential unmocked sendOtpSms in ${file}`);
      foundUnmockedSmsCall = true;
    }
  }
});
assert(!foundUnmockedSmsCall, 'All automated test suites strictly utilize mocks; zero real SMS are dispatched during testing');

// 7. Verify Privacy & Secret Redaction
console.log('\n[CHECK 7] Secret Redaction & Log Safety');
const sanitized = sampleReq.sanitizedUrl;
assert(!sanitized.includes(cfg.apiKey), 'Sanitized URL strictly hides API key');
assert(sanitized.includes('key=***REDACTED***'), 'Sanitized URL replaces API key with ***REDACTED***');

const testErrorText = `Provider error: key ${cfg.apiKey} was rejected`;
const scrubbedError = sanitizeSecret(testErrorText, cfg.apiKey);
assert(!scrubbedError.includes(cfg.apiKey), 'sanitizeSecret scrubs API key from provider error responses');
assert(scrubbedError.includes('***REDACTED***'), 'sanitizeSecret inserts ***REDACTED*** placeholder');

console.log('\n===================================================================');
console.log(`PREPARATION AUDIT RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log('===================================================================');

process.exit(failed > 0 ? 1 : 0);
