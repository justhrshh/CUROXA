const assert = require('assert');
const {
  getPublicAppUrl,
  getTenantPublicUrl,
  getTenantPortalUrl,
  getPublicAssetUrl,
  resolveEmailLogoUrl,
  getCanonicalLogoUrl,
  getTrustedOrigins,
  CANONICAL_LOGO_FILENAME
} = require('../config/urls');

console.log('=================================================================');
console.log('   QUROXA DEPLOYMENT SCENARIOS & MULTI-TENANT DOMAIN TEST SUITE   ');
console.log('=================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`[PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`[FAIL] ${name}: ${err.message}`);
    console.error(err.stack);
  }
}

// Save initial environment
const originalEnv = { ...process.env };

function resetEnv() {
  process.env = { ...originalEnv };
  delete process.env.PUBLIC_APP_URL;
  delete process.env.FRONTEND_URL;
  delete process.env.CLIENT_URL;
  delete process.env.APP_URL;
  delete process.env.CORS_ORIGIN;
  delete process.env.RENDER_EXTERNAL_URL;
  delete process.env.DEPLOYED_URL;
  delete process.env.DOMAIN;
  process.env.NODE_ENV = 'development';
}

// -----------------------------------------------------------------
// SCENARIO A: Same-Origin Deployment
// (Frontend & API unified under reverse proxy: e.g. https://portal.example.com)
// -----------------------------------------------------------------
runTest('Scenario A: Configured platform URL strips trailing slashes', () => {
  resetEnv();
  process.env.FRONTEND_URL = 'https://portal.example.com/';
  const url = getPublicAppUrl();
  assert.strictEqual(url, 'https://portal.example.com', 'Should strip trailing slash from same-origin domain');
});

runTest('Scenario A: Same-origin media and logo resolution uses canonical asset', () => {
  resetEnv();
  process.env.FRONTEND_URL = 'https://portal.example.com';
  const logoUrl = getCanonicalLogoUrl();
  assert.strictEqual(logoUrl, `https://portal.example.com/${CANONICAL_LOGO_FILENAME}`);
});

runTest('Scenario A: Relative upload paths resolve against configured same-origin', () => {
  resetEnv();
  process.env.FRONTEND_URL = 'https://portal.example.com';
  const resolved = resolveEmailLogoUrl('/uploads/logos/hospital_1.png');
  assert.strictEqual(resolved, 'https://portal.example.com/uploads/logos/hospital_1.png');
});

// -----------------------------------------------------------------
// SCENARIO B: Separate-Origin Deployment
// (Frontend: https://app.example.com, API: https://api.example.com)
// -----------------------------------------------------------------
runTest('Scenario B: PUBLIC_APP_URL overrides FRONTEND_URL for backend-generated links', () => {
  resetEnv();
  process.env.FRONTEND_URL = 'https://old.example.com';
  process.env.PUBLIC_APP_URL = 'https://app.example.com';
  const resolved = getPublicAppUrl();
  assert.strictEqual(resolved, 'https://app.example.com', 'PUBLIC_APP_URL must take precedence');
});

runTest('Scenario B: Email templates resolve external cloud assets (e.g. R2/S3) without alteration', () => {
  resetEnv();
  process.env.PUBLIC_APP_URL = 'https://app.example.com';
  const externalS3 = 'https://pub-myaccount.r2.dev/letterheads/doc_123.pdf';
  const resolved = resolveEmailLogoUrl(externalS3);
  assert.strictEqual(resolved, externalS3, 'External absolute HTTP/HTTPS URLs must not be mutated');
});

runTest('Scenario B: Data URIs are safely replaced with canonical logo in email contexts', () => {
  resetEnv();
  process.env.PUBLIC_APP_URL = 'https://app.example.com';
  const base64DataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';
  const resolved = resolveEmailLogoUrl(base64DataUri);
  assert.strictEqual(resolved, `https://app.example.com/${CANONICAL_LOGO_FILENAME}`, 'Data URIs must fall back to canonical asset');
});

// -----------------------------------------------------------------
// SCENARIO C: Multiple Hospital Domains (Multi-Tenant Custom Domains)
// -----------------------------------------------------------------
runTest('Scenario C: Hospital A with customDomain resolves tenant-branded portal URL', () => {
  resetEnv();
  process.env.PUBLIC_APP_URL = 'https://platform.quroxa.com';

  const hospitalA = {
    name: 'City Care Hospital',
    code: 'citycare',
    hospitalId: 'HSP-CITY01',
    customDomain: 'care.cityhospital.org'
  };

  const tenantBase = getTenantPublicUrl(hospitalA);
  assert.strictEqual(tenantBase, 'https://care.cityhospital.org', 'Should format https:// and normalize custom domain');

  const portalUrl = getTenantPortalUrl(hospitalA);
  assert.strictEqual(portalUrl, 'https://care.cityhospital.org/portal/HSP-CITY01', 'Tenant portal must use custom domain');
});

runTest('Scenario C: Hospital A with customDomain with protocol and trailing slash is normalized', () => {
  resetEnv();
  process.env.PUBLIC_APP_URL = 'https://platform.quroxa.com';

  const hospitalA = {
    name: 'City Care Hospital',
    hospitalId: 'HSP-CITY01',
    customDomain: 'https://care.cityhospital.org/'
  };

  const portalUrl = getTenantPortalUrl(hospitalA);
  assert.strictEqual(portalUrl, 'https://care.cityhospital.org/portal/HSP-CITY01', 'Trailing slash must be cleanly stripped');
});

runTest('Scenario C: Hospital B with NO customDomain falls back safely to platform public URL', () => {
  resetEnv();
  process.env.PUBLIC_APP_URL = 'https://platform.quroxa.com';

  const hospitalB = {
    name: 'Metro General Hospital',
    code: 'metro',
    hospitalId: 'HSP-METRO2',
    customDomain: ''
  };

  const portalUrl = getTenantPortalUrl(hospitalB);
  assert.strictEqual(portalUrl, 'https://platform.quroxa.com/portal/HSP-METRO2', 'Falls back to platform public URL');
});

runTest('Scenario C: SuperAdminOnboarding erpCustomDomain is also honored seamlessly', () => {
  resetEnv();
  process.env.PUBLIC_APP_URL = 'https://platform.quroxa.com';

  const onboardingHospital = {
    name: 'Apollo Apex',
    hospitalId: 'HSP-APO100',
    erpCustomDomain: 'apollo-portal.in'
  };

  const portalUrl = getTenantPortalUrl(onboardingHospital);
  assert.strictEqual(portalUrl, 'https://apollo-portal.in/portal/HSP-APO100', 'erpCustomDomain must be honored');
});

// -----------------------------------------------------------------
// SECURITY: Host Header Poisoning Defense
// -----------------------------------------------------------------
runTest('Security: Untrusted Host/Origin headers are rejected in production', () => {
  resetEnv();
  process.env.NODE_ENV = 'production';
  process.env.FRONTEND_URL = 'https://app.quroxa.com';

  const maliciousReq = {
    get: (header) => (header === 'host' ? 'evil-phishing-site.com' : null),
    headers: {
      host: 'evil-phishing-site.com',
      origin: 'https://evil-phishing-site.com',
      'x-forwarded-host': 'evil-phishing-site.com'
    }
  };

  const resolved = getPublicAppUrl(maliciousReq);
  assert.strictEqual(resolved, 'https://app.quroxa.com', 'Must ignore untrusted Host/Origin headers');
});

runTest('Security: Trusted CORS origin is honored when present in trusted list', () => {
  resetEnv();
  process.env.CORS_ORIGIN = 'https://app.quroxa.com,https://partners.quroxa.com';

  const trustedReq = {
    get: (header) => (header === 'origin' ? 'https://partners.quroxa.com' : null),
    headers: { origin: 'https://partners.quroxa.com' }
  };

  const resolved = getPublicAppUrl(trustedReq);
  assert.strictEqual(resolved, 'https://partners.quroxa.com', 'Trusted origin from CORS_ORIGIN should be accepted');
});

runTest('Security: Production guard returns empty string and logs error when no trusted origin exists', () => {
  resetEnv();
  process.env.NODE_ENV = 'production';
  // No environment variables set at all
  const resolved = getPublicAppUrl();
  assert.strictEqual(resolved, '', 'Must never return localhost in production when unconfigured');
});

runTest('Security: Development defaults to localhost:3000 only when NODE_ENV != production', () => {
  resetEnv();
  process.env.NODE_ENV = 'development';
  const resolved = getPublicAppUrl();
  assert.strictEqual(resolved, 'http://localhost:3000', 'Dev mode should have convenient localhost fallback');
});

// Restore environment
resetEnv();

console.log('\n=================================================================');
console.log(`TEST RESULTS: ${passedTests}/${totalTests} tests passed.`);
console.log('=================================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
