/**
 * PING4SMS TRANSACTIONAL OTP SMS SERVICE
 * 
 * Uses the client's confirmed working legacy API configuration:
 * - Endpoint: https://site.ping4sms.com/api/smsapi
 * - HTTP Method: GET
 * - Approved Route: 2 (Transactional / DLT)
 * - Approved Sender ID: PNGOTP
 * - Approved DLT Template ID: 1507165967974501361
 * - Approved DLT Template: "Dear Customer,{#var#} is your verification code -PNGOTP"
 * 
 * Parameters:
 * - key: PING4SMS_API_KEY
 * - route: 2
 * - sender: PNGOTP
 * - number: normalized 10-digit Indian recipient mobile number
 * - sms: URL-encoded OTP message
 * - templateid: 1507165967974501361
 * 
 * Security & Reliability Guarantees:
 * - Credentials reside exclusively in backend environment variables.
 * - Complete OTPs, API keys, and sensitive phone numbers are never logged in plaintext.
 * - API keys are strictly redacted from URLs, logs, errors, and responses.
 * - All query parameters are properly URL-encoded via standard WHATWG URL / URLSearchParams.
 * - Distinguishes gateway acceptance (status: 'sent') from handset delivery (status: 'delivered').
 * - Fails safely with standardized error codes to trigger Zero-Orphan Rollback.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { normalizeIndianMobile, maskPhoneNumber } = require('../../utils/phoneNormalization');

// TRAI DLT approved template definition
const REGISTERED_TEMPLATE_PATTERN = 'Dear Customer,{#var#} is your verification code -PNGOTP';
const DEFAULT_SENDER_ID = 'PNGOTP';
const DEFAULT_ROUTE = '2';
const DEFAULT_TEMPLATE_ID = '1507165967974501361';
const DEFAULT_API_URL = 'https://site.ping4sms.com/api/smsapi';
const REQUEST_TIMEOUT_MS = 8000;

/**
 * Builds the exact TRAI DLT approved message body for an OTP.
 * Strictly preserves the registered template wording.
 * 
 * @param {string|number} otp - 6-digit numeric OTP
 * @returns {string} Fully rendered message
 */
function buildDltOtpMessage(otp) {
  const cleanOtp = String(otp || '').trim();
  if (!/^\d{6}$/.test(cleanOtp)) {
    throw new Error('Invalid OTP format. OTP must be strictly 6 numeric digits.');
  }
  return REGISTERED_TEMPLATE_PATTERN.replace('{#var#}', cleanOtp);
}

/**
 * Resolves current PING4SMS service configuration from environment.
 */
function getPing4smsConfig() {
  return {
    apiKey: (process.env.PING4SMS_API_KEY || '').trim(),
    senderId: (process.env.PING4SMS_SENDER_ID || DEFAULT_SENDER_ID).trim(),
    templateId: (process.env.PING4SMS_TEMPLATE_ID || DEFAULT_TEMPLATE_ID).trim(),
    route: (process.env.PING4SMS_ROUTE || DEFAULT_ROUTE).trim(),
    apiUrl: (process.env.PING4SMS_API_URL || DEFAULT_API_URL).trim()
  };
}

/**
 * Validates that all required provider credentials and DLT IDs are present.
 */
function validateConfig(config) {
  if (!config.apiKey) {
    return { valid: false, error: 'PING4SMS_API_KEY environment variable is not configured.', code: 'MISSING_CONFIG' };
  }
  if (!config.templateId) {
    return { valid: false, error: 'PING4SMS_TEMPLATE_ID environment variable is not configured.', code: 'MISSING_CONFIG' };
  }
  if (!config.senderId) {
    return { valid: false, error: 'PING4SMS_SENDER_ID is not configured.', code: 'INVALID_CONFIG' };
  }
  if (!config.route) {
    return { valid: false, error: 'PING4SMS_ROUTE is not configured.', code: 'INVALID_CONFIG' };
  }
  return { valid: true };
}

/**
 * Sanitizes sensitive secrets (such as API keys) from text strings.
 */
function sanitizeSecret(text, secret) {
  if (!text || typeof text !== 'string') return '';
  if (secret && typeof secret === 'string' && secret.trim().length > 3) {
    return text.split(secret.trim()).join('***REDACTED***');
  }
  return text;
}

/**
 * Generates a sanitized URL string for safe logging with the API key redacted.
 */
function getSanitizedUrl(urlObj) {
  try {
    const safe = new URL(urlObj.toString());
    if (safe.searchParams.has('key')) {
      safe.searchParams.set('key', '***REDACTED***');
    }
    return safe.toString();
  } catch (_) {
    return '[INVALID_URL]';
  }
}

/**
 * Constructs the legacy PING4SMS GET request options and properly URL-encoded URL.
 * 
 * @param {Object} params
 * @param {string} params.mobile - Indian mobile number
 * @param {string|number} params.otp - 6-digit OTP
 * @param {Object} [params.config] - Optional config override
 * @returns {{
 *   method: 'GET',
 *   url: string,
 *   sanitizedUrl: string,
 *   parsedUrl: URL,
 *   requestOptions: Object,
 *   phoneValidation: Object,
 *   messageBody: string
 * }}
 */
function buildPing4smsRequest({ mobile, otp, config }) {
  const cfg = config || getPing4smsConfig();
  const phoneValidation = normalizeIndianMobile(mobile);
  if (!phoneValidation.isValid) {
    throw new Error(phoneValidation.error);
  }

  const messageBody = buildDltOtpMessage(otp);
  const parsedUrl = new URL(cfg.apiUrl || DEFAULT_API_URL);

  // Set all query parameters using WHATWG URLSearchParams to guarantee strict RFC 3986 encoding
  parsedUrl.searchParams.set('key', cfg.apiKey);
  parsedUrl.searchParams.set('route', cfg.route || DEFAULT_ROUTE);
  parsedUrl.searchParams.set('sender', cfg.senderId || DEFAULT_SENDER_ID);
  parsedUrl.searchParams.set('number', phoneValidation.normalized);
  parsedUrl.searchParams.set('sms', messageBody);
  parsedUrl.searchParams.set('templateid', cfg.templateId);

  const isHttps = parsedUrl.protocol === 'https:';
  const requestOptions = {
    protocol: parsedUrl.protocol,
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'GET',
    headers: {
      'User-Agent': 'QUROXA-SMS-Gateway/1.0',
      'Accept': 'application/json, text/plain, */*'
    },
    timeout: REQUEST_TIMEOUT_MS
  };

  return {
    method: 'GET',
    url: parsedUrl.toString(),
    sanitizedUrl: getSanitizedUrl(parsedUrl),
    parsedUrl,
    requestOptions,
    phoneValidation,
    messageBody
  };
}

/**
 * Sends a transactional OTP SMS via PING4SMS gateway using the confirmed legacy GET API.
 * 
 * @param {Object} params
 * @param {string} params.mobile - Recipient Indian mobile number (+91 / 91 / 0 / bare 10-digit)
 * @param {string|number} params.otp - 6-digit OTP code
 * @param {string} [params.tenantId] - Multi-hospital tenant context for isolation
 * @param {Function} [params._mockTransport] - Internal transport override for automated tests
 * @param {Function} [params._mockHttpRequest] - Internal HTTP request override for low-level protocol tests
 * @returns {Promise<{
 *   success: boolean,
 *   deliveryStatus: 'sent' | 'failed',
 *   provider: 'PING4SMS',
 *   recipientMasked: string,
 *   messageId?: string,
 *   error?: string,
 *   errorCode?: 'MISSING_CONFIG' | 'INVALID_PHONE' | 'INVALID_OTP' | 'PROVIDER_REJECTED' | 'NETWORK_TIMEOUT' | 'NETWORK_ERROR'
 * }>}
 */
async function sendOtpSms({ mobile, otp, tenantId, _mockTransport, _mockHttpRequest }) {
  const maskedPhone = maskPhoneNumber(mobile);

  // 1. Validate and normalize recipient mobile number
  const phoneValidation = normalizeIndianMobile(mobile);
  if (!phoneValidation.isValid) {
    console.warn(`[SMS] PING4SMS delivery rejected: ${phoneValidation.error} (Recipient: ${maskedPhone})`);
    return {
      success: false,
      deliveryStatus: 'failed',
      provider: 'PING4SMS',
      recipientMasked: maskedPhone,
      error: phoneValidation.error,
      errorCode: 'INVALID_PHONE'
    };
  }

  // 2. Validate OTP and render exact DLT message
  let messageBody;
  try {
    messageBody = buildDltOtpMessage(otp);
  } catch (otpErr) {
    console.warn(`[SMS] PING4SMS delivery rejected: ${otpErr.message}`);
    return {
      success: false,
      deliveryStatus: 'failed',
      provider: 'PING4SMS',
      recipientMasked: maskedPhone,
      error: otpErr.message,
      errorCode: 'INVALID_OTP'
    };
  }

  // 3. Validate provider configuration
  const config = getPing4smsConfig();
  const configCheck = validateConfig(config);
  if (!configCheck.valid) {
    console.error(`[SMS] PING4SMS configuration error: ${configCheck.error}`);
    return {
      success: false,
      deliveryStatus: 'failed',
      provider: 'PING4SMS',
      recipientMasked: maskedPhone,
      error: configCheck.error,
      errorCode: configCheck.code
    };
  }

  // 4. Construct request details using confirmed GET legacy endpoint
  let requestDetails;
  try {
    requestDetails = buildPing4smsRequest({ mobile, otp, config });
  } catch (buildErr) {
    return {
      success: false,
      deliveryStatus: 'failed',
      provider: 'PING4SMS',
      recipientMasked: maskedPhone,
      error: buildErr.message,
      errorCode: 'INVALID_PHONE'
    };
  }

  // 5. Dispatch via mock transport if provided (e.g. during automated test execution)
  if (_mockTransport && typeof _mockTransport === 'function') {
    return _mockTransport({
      mobile: phoneValidation.normalized,
      providerFormat: phoneValidation.providerFormat,
      message: messageBody,
      config,
      maskedPhone,
      requestDetails
    });
  }

  // 6. Execute GET request to PING4SMS legacy endpoint
  const parsedUrl = requestDetails.parsedUrl;
  const isHttps = parsedUrl.protocol === 'https:';
  const transport = isHttps ? https : http;

  return new Promise((resolve) => {
    // Check if an HTTP simulation handler is injected (for protocol-level unit testing without network)
    if (_mockHttpRequest && typeof _mockHttpRequest === 'function') {
      return _mockHttpRequest(requestDetails, resolve);
    }

    const req = transport.request(requestDetails.requestOptions, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => { responseBody += chunk; });
      res.on('end', () => {
        const statusCode = res.statusCode;
        let parsed = null;
        try {
          parsed = JSON.parse(responseBody);
        } catch (_) {
          parsed = { raw: responseBody };
        }

        // Check for explicit rejection keywords in response body
        const isFailureKeyword = /(invalid|error|fail|reject|insufficient|unauthorized|denied|blocked|low\s*balance)/i.test(responseBody);

        // Success criteria for PING4SMS legacy gateway:
        // - HTTP 2xx
        // - No failure keywords
        // - JSON status: 'success' | code: 200, or text containing sent/accepted/queued/success, or numeric message ID
        const isSuccess = statusCode >= 200 && statusCode < 300 && !isFailureKeyword && (
          (parsed && (parsed.status === 'success' || parsed.status === true || parsed.code === 200 || parsed.code === '200')) ||
          /sent|accepted|queued|success/i.test(responseBody) ||
          /^\d+$/.test(responseBody.trim())
        );

        if (isSuccess) {
          const messageId = parsed.data?.message_id || 
                            (Array.isArray(parsed.data) && parsed.data[0]?.id) ||
                            parsed.message_id || 
                            parsed.id || 
                            (/^\d+$/.test(responseBody.trim()) ? responseBody.trim() : null);

          console.log(`[SMS] PING4SMS accepted OTP dispatch for ${maskedPhone} (Sender: ${config.senderId}, Route: ${config.route}${tenantId ? `, Tenant: ${tenantId}` : ''})`);
          // Note: 'sent' denotes provider acceptance; handset delivery is distinguished
          return resolve({
            success: true,
            deliveryStatus: 'sent',
            provider: 'PING4SMS',
            recipientMasked: maskedPhone,
            messageId: messageId ? String(messageId) : undefined
          });
        }

        const rawError = (parsed && (parsed.message || parsed.error)) || responseBody || `HTTP ${statusCode}`;
        const providerError = sanitizeSecret(rawError, config.apiKey);
        console.error(`[SMS] PING4SMS rejected dispatch for ${maskedPhone}: ${providerError}`);
        return resolve({
          success: false,
          deliveryStatus: 'failed',
          provider: 'PING4SMS',
          recipientMasked: maskedPhone,
          error: `Provider rejected SMS dispatch: ${providerError}`,
          errorCode: 'PROVIDER_REJECTED'
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      console.error(`[SMS] PING4SMS request timed out after ${REQUEST_TIMEOUT_MS}ms for ${maskedPhone}`);
      resolve({
        success: false,
        deliveryStatus: 'failed',
        provider: 'PING4SMS',
        recipientMasked: maskedPhone,
        error: `SMS provider connection timed out after ${REQUEST_TIMEOUT_MS}ms.`,
        errorCode: 'NETWORK_TIMEOUT'
      });
    });

    req.on('error', (err) => {
      const sanitizedErr = sanitizeSecret(err.message, config.apiKey);
      console.error(`[SMS] PING4SMS network failure for ${maskedPhone}:`, sanitizedErr);
      resolve({
        success: false,
        deliveryStatus: 'failed',
        provider: 'PING4SMS',
        recipientMasked: maskedPhone,
        error: `Network failure connecting to SMS gateway: ${sanitizedErr}`,
        errorCode: 'NETWORK_ERROR'
      });
    });

    // End GET request (no request body)
    req.end();
  });
}

module.exports = {
  sendOtpSms,
  validateConfig,
  buildDltOtpMessage,
  getPing4smsConfig,
  buildPing4smsRequest,
  sanitizeSecret,
  getSanitizedUrl,
  REGISTERED_TEMPLATE_PATTERN,
  DEFAULT_SENDER_ID,
  DEFAULT_ROUTE,
  DEFAULT_TEMPLATE_ID,
  DEFAULT_API_URL,
  REQUEST_TIMEOUT_MS
};
