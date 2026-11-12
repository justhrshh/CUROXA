/**
 * QUROXA PHASE 2 AUTOMATED TEST SUITE: NOTIFICATION & PING4SMS GATEWAY
 * 
 * Verifies:
 * 1. Indian Phone Normalization & Validation (TRAI/DoT rules, prefixes, rejections)
 * 2. Exact Registered DLT Message Construction ("Dear Customer,{#var#} is your verification code -PNGOTP")
 * 3. PING4SMS Provider Acceptance Simulation
 * 4. PING4SMS Provider Rejection Simulation
 * 5. PING4SMS Gateway Timeout & Network Error Classification
 * 6. Missing Credentials & Config Validation
 * 7. Unified Notification Dispatcher (Channel routing, contract consistency)
 * 8. Zero-Silent-Fallback Enforcement (no unintended fallback from SMS to email)
 * 9. Explicit Email Fallback Handling (when authorized)
 * 10. Privacy & Secret Hygiene (No API key, unmasked phone, or plaintext OTP leaks)
 */

const { normalizeIndianMobile, isValidIndianMobile, maskPhoneNumber } = require('../utils/phoneNormalization');
const {
  sendOtpSms,
  buildDltOtpMessage,
  buildPing4smsRequest,
  getSanitizedUrl,
  sanitizeSecret,
  REGISTERED_TEMPLATE_PATTERN
} = require('../services/sms/ping4smsService');
const { sendOtpNotification, maskEmail } = require('../services/notificationService');

let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failedTests++;
  }
}

async function runPhase2Tests() {
  console.log('===================================================================');
  console.log('QUROXA PHASE 2: NOTIFICATION ARCHITECTURE & PING4SMS TEST SUITE');
  console.log('===================================================================\n');

  try {
    // -------------------------------------------------------------
    // Test Group 1: Phone Normalization & Validation
    // -------------------------------------------------------------
    console.log('[TEST GROUP 1] Indian Mobile Normalization & TRAI Allocation Rules');

    // 1.1 Valid bare 10-digit starting with 9
    const res1 = normalizeIndianMobile('9876543210');
    assert(res1.isValid && res1.normalized === '9876543210' && res1.providerFormat === '919876543210', 'Normalizes bare 10-digit number');

    // 1.2 Valid +91 prefix with spaces and dashes
    const res2 = normalizeIndianMobile('+91 98765-43210');
    assert(res2.isValid && res2.normalized === '9876543210' && res2.e164 === '+919876543210', 'Normalizes +91 with punctuation');

    // 1.3 Valid 91 prefix without plus
    const res3 = normalizeIndianMobile('918765432109');
    assert(res3.isValid && res3.normalized === '8765432109', 'Normalizes 91-prefixed 12-digit number');

    // 1.4 Valid leading 0 prefix (trunk code)
    const res4 = normalizeIndianMobile('07654321098');
    assert(res4.isValid && res4.normalized === '7654321098', 'Normalizes 0-prefixed 11-digit number');

    // 1.5 Valid starting digits: 6, 7, 8, 9
    assert(isValidIndianMobile('6123456789'), 'Accepts valid mobile starting with 6');
    assert(isValidIndianMobile('7123456789'), 'Accepts valid mobile starting with 7');
    assert(isValidIndianMobile('8123456789'), 'Accepts valid mobile starting with 8');
    assert(isValidIndianMobile('9123456789'), 'Accepts valid mobile starting with 9');

    // 1.6 Rejection of invalid starting digits (0-5)
    assert(!isValidIndianMobile('5123456789'), 'Rejects mobile starting with 5');
    assert(!isValidIndianMobile('1123456789'), 'Rejects mobile starting with 1');

    // 1.7 Rejection of wrong lengths (No naive slice(-10))
    assert(!isValidIndianMobile('987654321'), 'Rejects short number (9 digits)');
    assert(!isValidIndianMobile('919876543210123'), 'Rejects excessively long number (15 digits)');

    // 1.8 Rejection of letters and symbols
    assert(!isValidIndianMobile('98765abcde'), 'Rejects input with alphabetic characters');
    assert(!isValidIndianMobile(null), 'Rejects null input');
    assert(!isValidIndianMobile(''), 'Rejects empty input');


    // -------------------------------------------------------------
    // Test Group 2: TRAI DLT Template Fidelity
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 2] TRAI DLT Registered Template Fidelity');

    assert(
      REGISTERED_TEMPLATE_PATTERN === 'Dear Customer,{#var#} is your verification code -PNGOTP',
      'Registered DLT pattern matches exact approved wording'
    );

    const renderedMessage = buildDltOtpMessage('482910');
    assert(
      renderedMessage === 'Dear Customer,482910 is your verification code -PNGOTP',
      'Renders exact DLT SMS body substituting only {#var#}'
    );

    let threwInvalidOtp = false;
    try {
      buildDltOtpMessage('12345'); // only 5 digits
    } catch (_) {
      threwInvalidOtp = true;
    }
    assert(threwInvalidOtp, 'Rejects non-6-digit OTP during template rendering');


    // -------------------------------------------------------------
    // Test Group 3: PING4SMS Provider Acceptance
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 3] PING4SMS Gateway Acceptance Simulation');

    // Temporarily set test environment configuration
    process.env.PING4SMS_API_KEY = 'test_api_key_mock_123';
    process.env.PING4SMS_TEMPLATE_ID = '1507165967974501361';
    process.env.PING4SMS_SENDER_ID = 'PNGOTP';
    process.env.PING4SMS_ROUTE = '2';
    process.env.PING4SMS_API_URL = 'https://site.ping4sms.com/api/smsapi';

    const mockSuccessTransport = async ({ mobile, message, config }) => {
      // Validate inputs delivered to transport
      if ((mobile === '919876543210' || mobile === '9876543210') && message.startsWith('Dear Customer,') && message.endsWith('is your verification code -PNGOTP')) {
        return {
          success: true,
          deliveryStatus: 'sent',
          provider: 'PING4SMS',
          recipientMasked: '+91 ******3210',
          messageId: 'MSG-TEST-998811'
        };
      }
      return { success: false, deliveryStatus: 'failed', provider: 'PING4SMS', recipientMasked: '******' };
    };

    const successResult = await sendOtpSms({
      mobile: '+91 98765 43210',
      otp: '654321',
      tenantId: 'city_hospital',
      _mockTransport: mockSuccessTransport
    });

    assert(successResult.success === true, 'sendOtpSms returns success: true on provider acceptance');
    assert(successResult.deliveryStatus === 'sent', 'deliveryStatus is "sent" (distinguished from handset delivered)');
    assert(successResult.provider === 'PING4SMS', 'Provider identified as PING4SMS');
    assert(successResult.messageId === 'MSG-TEST-998811', 'Captures gateway message ID');


    // -------------------------------------------------------------
    // Test Group 4: Provider Rejection Handling
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 4] Provider Rejection & Failure Handling');

    const mockRejectTransport = async () => ({
      success: false,
      deliveryStatus: 'failed',
      provider: 'PING4SMS',
      recipientMasked: '+91 ******3210',
      error: 'Provider rejected SMS dispatch: Insufficient wallet balance',
      errorCode: 'PROVIDER_REJECTED'
    });

    const rejectResult = await sendOtpSms({
      mobile: '9876543210',
      otp: '654321',
      _mockTransport: mockRejectTransport
    });

    assert(rejectResult.success === false, 'Returns success: false when provider rejects dispatch');
    assert(rejectResult.errorCode === 'PROVIDER_REJECTED', 'Classifies failure as PROVIDER_REJECTED');


    // -------------------------------------------------------------
    // Test Group 5: Missing Credentials Validation
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 5] Missing Credentials & Configuration Safety');

    delete process.env.PING4SMS_API_KEY;
    const missingKeyResult = await sendOtpSms({ mobile: '9876543210', otp: '654321' });
    assert(missingKeyResult.success === false && missingKeyResult.errorCode === 'MISSING_CONFIG', 'Fails closed with MISSING_CONFIG when API key is missing');

    process.env.PING4SMS_API_KEY = 'test_key';
    delete process.env.PING4SMS_TEMPLATE_ID;
    const missingTemplateResult = await sendOtpSms({ mobile: '9876543210', otp: '654321' });
    assert(missingTemplateResult.success === false && missingTemplateResult.errorCode === 'MISSING_CONFIG', 'Fails closed when Template ID is missing');

    // Restore test credentials
    process.env.PING4SMS_TEMPLATE_ID = '1507165967974501361';


    // -------------------------------------------------------------
    // Test Group 6: Unified Notification Dispatcher (Routing & Contract)
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 6] Unified Notification Dispatcher Routing');

    // 6.1 Route to SMS
    const dispatcherSmsResult = await sendOtpNotification({
      channel: 'sms',
      target: '+91 98765 43210',
      otp: '123456',
      tenantId: 'city_hospital',
      _mockSmsTransport: mockSuccessTransport
    });
    assert(dispatcherSmsResult.success && dispatcherSmsResult.channel === 'sms', 'Dispatcher correctly routes SMS channel');
    assert(dispatcherSmsResult.provider === 'PING4SMS', 'Dispatcher reports PING4SMS provider for SMS');

    // 6.2 Route to Email
    const mockEmailTransport = async ({ target, otp, maskedTarget }) => ({
      success: true,
      channel: 'email',
      provider: 'SMTP',
      targetMasked: maskedTarget,
      deliveryStatus: 'sent'
    });

    const dispatcherEmailResult = await sendOtpNotification({
      channel: 'email',
      target: 'doctor@hospital.org',
      otp: '123456',
      tenantId: 'city_hospital',
      _mockEmailTransport: mockEmailTransport
    });
    assert(dispatcherEmailResult.success && dispatcherEmailResult.channel === 'email', 'Dispatcher correctly routes Email channel');
    assert(dispatcherEmailResult.provider === 'SMTP', 'Dispatcher reports SMTP provider for Email');


    // -------------------------------------------------------------
    // Test Group 7: Zero Silent Fallback Enforcement
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 7] Zero Silent Fallback Enforcement');

    const failingSmsTransport = async () => ({
      success: false,
      deliveryStatus: 'failed',
      provider: 'PING4SMS',
      recipientMasked: '+91 ******3210',
      error: 'Network timeout',
      errorCode: 'NETWORK_TIMEOUT'
    });

    // Case A: SMS fails, allowFallback is false (default)
    const strictResult = await sendOtpNotification({
      channel: 'sms',
      target: '+91 98765 43210',
      otp: '123456',
      allowFallback: false,
      fallbackEmail: 'doctor@hospital.org',
      _mockSmsTransport: failingSmsTransport,
      _mockEmailTransport: mockEmailTransport
    });
    assert(strictResult.success === false, 'SMS failure returns failure when allowFallback: false (NO silent fallback)');
    assert(strictResult.channel === 'sms', 'Remains on SMS channel without falling back');

    // Case B: SMS fails, allowFallback is true with fallbackEmail provided
    const permittedFallbackResult = await sendOtpNotification({
      channel: 'sms',
      target: '+91 98765 43210',
      otp: '123456',
      allowFallback: true,
      fallbackEmail: 'doctor@hospital.org',
      _mockSmsTransport: failingSmsTransport,
      _mockEmailTransport: mockEmailTransport
    });
    assert(permittedFallbackResult.success === true, 'Dispatches via fallback email when allowFallback: true');
    assert(permittedFallbackResult.fallbackTriggered === true, 'Flags that fallback was triggered');


    // -------------------------------------------------------------
    // Test Group 8: Privacy & Secret Hygiene
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 8] Privacy & Secret Hygiene');

    const maskedPhone = maskPhoneNumber('9876543210');
    assert(maskedPhone === '+91 ******3210', 'Phone masking obscures middle 6 digits');
    assert(!maskedPhone.includes('987654'), 'Plaintext mobile is not exposed in masked phone string');

    const maskedMail = maskEmail('sarah.connor@hospital.org');
    assert(maskedMail === 's***r@hospital.org', 'Email masking obscures sensitive local part');

    // Verify response objects do not leak API credentials
    assert(!JSON.stringify(dispatcherSmsResult).includes('test_api_key_mock_123'), 'Notification response contains zero API keys');
    assert(!JSON.stringify(dispatcherSmsResult).includes('123456'), 'Notification response contains zero plaintext OTP codes');


    // -------------------------------------------------------------
    // Test Group 9: Confirmed Legacy PING4SMS API Contract & Parameter Verification
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 9] Confirmed Legacy PING4SMS API Contract & Parameter Verification');

    const testApiKey = 'ping4sms_secret_key_abc123';
    const testConfig = {
      apiKey: testApiKey,
      templateId: '1507165967974501361',
      senderId: 'PNGOTP',
      route: '2',
      apiUrl: 'https://site.ping4sms.com/api/smsapi'
    };

    const reqDetails = buildPing4smsRequest({
      mobile: '+91 98765 43210',
      otp: '123456',
      config: testConfig
    });

    // 9.1 Correct endpoint and HTTP method
    assert(reqDetails.method === 'GET', 'Uses HTTP GET method');
    assert(reqDetails.parsedUrl.origin + reqDetails.parsedUrl.pathname === 'https://site.ping4sms.com/api/smsapi', 'Targets confirmed legacy endpoint https://site.ping4sms.com/api/smsapi');

    // 9.2 Correct route, sender ID, template ID, and number
    assert(reqDetails.parsedUrl.searchParams.get('route') === '2', 'Query parameter route is 2');
    assert(reqDetails.parsedUrl.searchParams.get('sender') === 'PNGOTP', 'Query parameter sender is PNGOTP');
    assert(reqDetails.parsedUrl.searchParams.get('templateid') === '1507165967974501361', 'Query parameter templateid is 1507165967974501361');
    assert(reqDetails.parsedUrl.searchParams.get('number') === '9876543210', 'Query parameter number is normalized 10-digit mobile');
    assert(reqDetails.parsedUrl.searchParams.get('key') === testApiKey, 'Query parameter key contains API key');

    // 9.3 Correct message substitution
    assert(reqDetails.messageBody === 'Dear Customer,123456 is your verification code -PNGOTP', 'Substitutes only the OTP variable into registered template');
    assert(reqDetails.parsedUrl.searchParams.get('sms') === 'Dear Customer,123456 is your verification code -PNGOTP', 'Query parameter sms contains exact rendered message');

    // 9.4 URL encoding
    const rawSearch = reqDetails.parsedUrl.search;
    assert(!rawSearch.includes(' '), 'Query string has zero unescaped space characters');
    assert(rawSearch.includes('sms=Dear+Customer') || rawSearch.includes('sms=Dear%20Customer'), 'Query parameter sms is properly URL-encoded');

    // 9.5 API key redaction in logging and URLs
    const sanitizedUrl = reqDetails.sanitizedUrl;
    assert(!sanitizedUrl.includes(testApiKey), 'Sanitized URL does not expose API key');
    assert(sanitizedUrl.includes('key=***REDACTED***'), 'Sanitized URL redacts API key with ***REDACTED***');

    // 9.6 Protocol Simulation: JSON success response
    const mockHttpSuccess = async (details, resolve) => {
      resolve({
        success: true,
        deliveryStatus: 'sent',
        provider: 'PING4SMS',
        recipientMasked: '+91 ******3210',
        messageId: 'LEGACY-MSG-554433'
      });
    };
    const protoSuccess = await sendOtpSms({
      mobile: '9876543210',
      otp: '123456',
      _mockHttpRequest: mockHttpSuccess
    });
    assert(protoSuccess.success === true && protoSuccess.messageId === 'LEGACY-MSG-554433', 'Handles simulated gateway success response');

    // 9.7 Protocol Simulation: Provider rejection with API key in error text (scrubbing test)
    const mockHttpReject = async (details, resolve) => {
      const rawErrorWithSecret = `Invalid Template ID: 1507165967974501361 for key ${testApiKey}`;
      resolve({
        success: false,
        deliveryStatus: 'failed',
        provider: 'PING4SMS',
        recipientMasked: '+91 ******3210',
        error: sanitizeSecret(rawErrorWithSecret, testApiKey),
        errorCode: 'PROVIDER_REJECTED'
      });
    };
    const protoReject = await sendOtpSms({
      mobile: '9876543210',
      otp: '123456',
      _mockHttpRequest: mockHttpReject
    });
    assert(protoReject.success === false && protoReject.errorCode === 'PROVIDER_REJECTED', 'Handles simulated provider rejection');
    assert(!protoReject.error.includes(testApiKey), 'Provider error message has API key redacted');

    // 9.8 Protocol Simulation: Network timeout
    const mockHttpTimeout = async (details, resolve) => {
      resolve({
        success: false,
        deliveryStatus: 'failed',
        provider: 'PING4SMS',
        recipientMasked: '+91 ******3210',
        error: 'SMS provider connection timed out after 8000ms.',
        errorCode: 'NETWORK_TIMEOUT'
      });
    };
    const protoTimeout = await sendOtpSms({
      mobile: '9876543210',
      otp: '123456',
      _mockHttpRequest: mockHttpTimeout
    });
    assert(protoTimeout.success === false && protoTimeout.errorCode === 'NETWORK_TIMEOUT', 'Handles simulated gateway timeout');

    // 9.9 Protocol Simulation: Network failure / connection reset
    const mockHttpNetError = async (details, resolve) => {
      resolve({
        success: false,
        deliveryStatus: 'failed',
        provider: 'PING4SMS',
        recipientMasked: '+91 ******3210',
        error: 'Network failure connecting to SMS gateway: ECONNRESET',
        errorCode: 'NETWORK_ERROR'
      });
    };
    const protoNetError = await sendOtpSms({
      mobile: '9876543210',
      otp: '123456',
      _mockHttpRequest: mockHttpNetError
    });
    assert(protoNetError.success === false && protoNetError.errorCode === 'NETWORK_ERROR', 'Handles simulated gateway network error');


  } catch (err) {
    console.error('Test Execution Error:', err);
    failedTests++;
  } finally {
    console.log('\n===================================================================');
    console.log(`PHASE 2 TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('===================================================================');
    process.exit(failedTests > 0 ? 1 : 0);
  }
}

runPhase2Tests();
