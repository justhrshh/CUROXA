/**
 * QUROXA — PING4SMS CONFIGURATION VALIDATION & FALLBACK UNIT TEST
 * 
 * Verifies defensive fallback behavior for PING4SMS configuration:
 * 1. Default template ID fallback when PING4SMS_TEMPLATE_ID is unset.
 * 2. Explicit template ID override when PING4SMS_TEMPLATE_ID is provided.
 * 3. Validation success when API key is provided and template ID defaults.
 * 4. Validation rejection when API key is missing.
 * 5. DLT message building and parameter encoding with fallback template.
 */

const {
  getPing4smsConfig,
  validateConfig,
  buildPing4smsRequest,
  REGISTERED_TEMPLATE_PATTERN
} = require('../services/sms/ping4smsService');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

console.log('===================================================================');
console.log('TEST SUITE: PING4SMS CONFIGURATION FALLBACK & DEFENSIVE VALIDATION');
console.log('===================================================================\n');

// Save existing env
const savedEnv = { ...process.env };

try {
  // Test 1: Template ID fallback when PING4SMS_TEMPLATE_ID is unset
  delete process.env.PING4SMS_TEMPLATE_ID;
  process.env.PING4SMS_API_KEY = 'test_api_key_12345';
  
  const cfgDefault = getPing4smsConfig();
  assert(
    cfgDefault.templateId === '1507165967974501361',
    `templateId defaults to approved DLT template (1507165967974501361) when unset (got: ${cfgDefault.templateId})`
  );
  assert(
    cfgDefault.senderId === 'PNGOTP',
    `senderId defaults to PNGOTP (got: ${cfgDefault.senderId})`
  );
  assert(
    cfgDefault.route === '2',
    `route defaults to 2 (got: ${cfgDefault.route})`
  );
  assert(
    cfgDefault.apiUrl === 'https://site.ping4sms.com/api/smsapi',
    `apiUrl defaults to https://site.ping4sms.com/api/smsapi`
  );

  // Test 2: Validation passes with default templateId when API key is present
  const valResult = validateConfig(cfgDefault);
  assert(valResult.valid === true, 'validateConfig() passes with API key and default templateId');

  // Test 3: Template ID override when PING4SMS_TEMPLATE_ID is explicitly set
  process.env.PING4SMS_TEMPLATE_ID = '999999999999999999';
  const cfgCustom = getPing4smsConfig();
  assert(
    cfgCustom.templateId === '999999999999999999',
    `templateId uses explicit env value when provided (got: ${cfgCustom.templateId})`
  );

  // Test 4: Validation fails when PING4SMS_API_KEY is missing
  delete process.env.PING4SMS_API_KEY;
  const cfgNoKey = getPing4smsConfig();
  const valNoKey = validateConfig(cfgNoKey);
  assert(
    valNoKey.valid === false && valNoKey.code === 'MISSING_CONFIG',
    `validateConfig() fails with MISSING_CONFIG when PING4SMS_API_KEY is missing (error: ${valNoKey.error})`
  );

  // Test 5: Request building with default config
  process.env.PING4SMS_API_KEY = 'mock_valid_key_1234567890';
  delete process.env.PING4SMS_TEMPLATE_ID;
  const cfgTest = getPing4smsConfig();
  const reqDetails = buildPing4smsRequest({
    mobile: '9876543210',
    otp: '123456',
    config: cfgTest
  });

  assert(reqDetails.method === 'GET', 'Request method is GET');
  assert(reqDetails.parsedUrl.searchParams.get('templateid') === '1507165967974501361', 'URL contains templateid=1507165967974501361');
  assert(reqDetails.parsedUrl.searchParams.get('sender') === 'PNGOTP', 'URL contains sender=PNGOTP');
  assert(reqDetails.parsedUrl.searchParams.get('route') === '2', 'URL contains route=2');
  assert(reqDetails.parsedUrl.searchParams.get('number') === '9876543210', 'URL contains normalized 10-digit number');
  assert(
    reqDetails.parsedUrl.searchParams.get('sms') === 'Dear Customer,123456 is your verification code -PNGOTP',
    'URL contains exact DLT message pattern with OTP'
  );

} finally {
  // Restore environment
  process.env = savedEnv;
}

console.log('\n===================================================================');
console.log(`TEST SUMMARY: ${passed} passed, ${failed} failed`);
console.log('===================================================================');

if (failed > 0) {
  process.exit(1);
}
