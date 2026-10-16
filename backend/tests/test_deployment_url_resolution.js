const assert = require('assert');
const {
  getPublicAppUrl,
  getPublicAssetUrl,
  resolveEmailLogoUrl,
  getCanonicalLogoUrl
} = require('../config/urls');

console.log('===============================================================');
console.log('TESTING DEPLOYMENT-INDEPENDENT URL RESOLUTION ARCHITECTURE');
console.log('===============================================================');

// Backup env
const originalEnv = { ...process.env };

function resetEnv() {
  delete process.env.PUBLIC_APP_URL;
  delete process.env.FRONTEND_URL;
  delete process.env.CLIENT_URL;
  delete process.env.APP_URL;
  delete process.env.CORS_ORIGIN;
  delete process.env.DOMAIN;
  delete process.env.RENDER_EXTERNAL_URL;
  delete process.env.DEPLOYED_URL;
  process.env.NODE_ENV = 'development';
}

try {
  // Test 1: Explicit FRONTEND_URL in dev
  resetEnv();
  process.env.FRONTEND_URL = 'https://app.customdomain.org/';
  assert.strictEqual(getPublicAppUrl(), 'https://app.customdomain.org', 'Strips trailing slash from FRONTEND_URL');
  console.log('✓ PASS: Resolves explicit FRONTEND_URL without trailing slash');

  // Test 2: PUBLIC_APP_URL override
  resetEnv();
  process.env.PUBLIC_APP_URL = 'https://portal.myhealthcare.com';
  process.env.FRONTEND_URL = 'https://app.customdomain.org';
  assert.strictEqual(getPublicAppUrl(), 'https://portal.myhealthcare.com', 'PUBLIC_APP_URL takes priority over FRONTEND_URL');
  console.log('✓ PASS: Resolves PUBLIC_APP_URL priority');

  // Test 3: Untrusted request origin in production is rejected
  resetEnv();
  process.env.NODE_ENV = 'production';
  process.env.FRONTEND_URL = 'https://app.hospital.com';
  process.env.CORS_ORIGIN = 'https://app.hospital.com,https://admin.hospital.com';
  
  const untrustedReq = {
    get: (h) => (h === 'origin' ? 'https://attacker-phishing.com' : null),
    headers: { origin: 'https://attacker-phishing.com' }
  };
  const resolvedUntrusted = getPublicAppUrl(untrustedReq);
  assert.strictEqual(resolvedUntrusted, 'https://app.hospital.com', 'Untrusted request origin rejected in favor of canonical FRONTEND_URL');
  console.log('✓ PASS: Untrusted request origin rejected (prevents host header poisoning)');

  // Test 4: Trusted request origin in production is honored
  const trustedReq = {
    get: (h) => (h === 'origin' ? 'https://admin.hospital.com' : null),
    headers: { origin: 'https://admin.hospital.com' }
  };
  const resolvedTrusted = getPublicAppUrl(trustedReq);
  assert.strictEqual(resolvedTrusted, 'https://admin.hospital.com', 'Trusted request origin from CORS_ORIGIN is honored');
  console.log('✓ PASS: Trusted request origin honored');

  // Test 5: Production guard against unconfigured environment
  resetEnv();
  process.env.NODE_ENV = 'production';
  const prodGuard = getPublicAppUrl();
  assert.strictEqual(prodGuard, '', 'Production returns empty string and logs error when no trusted origin is configured (never emits localhost)');
  console.log('✓ PASS: Production guard prevents emitting localhost in emails');

  // Test 6: Development fallback
  resetEnv();
  process.env.NODE_ENV = 'development';
  const devFallback = getPublicAppUrl();
  assert.strictEqual(devFallback, 'http://localhost:3000', 'Development cleanly defaults to localhost:3000');
  console.log('✓ PASS: Development fallback defaults to localhost:3000');

  // Test 7: Asset and email logo resolution
  resetEnv();
  process.env.FRONTEND_URL = 'https://app.hospital.com';
  assert.strictEqual(getPublicAssetUrl('logo.png'), 'https://app.hospital.com/logo.png', 'Public asset resolved against canonical URL');
  assert.strictEqual(getPublicAssetUrl('/uploads/hosp.jpg'), 'https://app.hospital.com/uploads/hosp.jpg', 'Relative upload path resolved');
  assert.strictEqual(resolveEmailLogoUrl('https://cdn.external.com/logo.png'), 'https://cdn.external.com/logo.png', 'Preserves absolute external logo');
  assert.strictEqual(resolveEmailLogoUrl('data:image/png;base64,iVBORw0KGgoAAA...'), 'https://app.hospital.com/quroxa_new_logo.png', 'Base64 data URI replaced with canonical logo for email client safety');
  console.log('✓ PASS: Public asset and email logo safety resolution verified');

  console.log('===============================================================');
  console.log('ALL URL RESOLUTION TESTS PASSED SUCCESSFULLY (7/7)');
  console.log('===============================================================');
} finally {
  // Restore original env
  for (const k in process.env) {
    if (!(k in originalEnv)) delete process.env[k];
  }
  Object.assign(process.env, originalEnv);
}
