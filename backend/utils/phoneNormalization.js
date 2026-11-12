/**
 * INDIAN MOBILE NUMBER NORMALIZATION & VALIDATION UTILITY
 * 
 * Complies with Department of Telecommunications (DoT) and TRAI National Numbering Plan:
 * - Valid Indian mobile numbers are strictly 10 digits long.
 * - Valid initial digits for Indian mobile services are 6, 7, 8, or 9.
 * - Supports prefix formats:
 *   - +91XXXXXXXXXX
 *   - 91XXXXXXXXXX
 *   - 0XXXXXXXXXX
 *   - XXXXXXXXXX
 * - Rejects non-mobile allocations (starting with 0-5), invalid lengths, and malformed inputs.
 * - Protects against naive slice(-10) truncation vulnerability.
 */

/**
 * Normalizes and validates an Indian mobile number.
 * 
 * @param {string|number} rawInput - Raw phone number input
 * @returns {{
 *   isValid: boolean,
 *   normalized: string|null,      // Clean 10-digit format (e.g. "9876543210")
 *   providerFormat: string|null,  // 91-prefixed format for SMS gateways (e.g. "919876543210")
 *   e164: string|null,            // E.164 international format (e.g. "+919876543210")
 *   masked: string|null,          // Redacted format for safe logs/UI (e.g. "+91 ******3210")
 *   error?: string
 * }}
 */
function normalizeIndianMobile(rawInput) {
  if (rawInput === null || rawInput === undefined) {
    return {
      isValid: false,
      normalized: null,
      providerFormat: null,
      e164: null,
      masked: null,
      error: 'Phone number is required.'
    };
  }

  const str = String(rawInput).trim();
  if (!str) {
    return {
      isValid: false,
      normalized: null,
      providerFormat: null,
      e164: null,
      masked: null,
      error: 'Phone number cannot be empty.'
    };
  }

  // Reject input containing disallowed characters (allow digits, spaces, hyphens, parentheses, and leading plus)
  if (/[^\d\s\-\(\)\+]/.test(str)) {
    return {
      isValid: false,
      normalized: null,
      providerFormat: null,
      e164: null,
      masked: null,
      error: 'Phone number contains invalid non-numeric characters.'
    };
  }

  // Strip all non-digit characters except we note if a leading plus was present
  const hasLeadingPlus = str.startsWith('+');
  const digitsOnly = str.replace(/\D/g, '');

  let nationalTenDigits = null;

  // Case A: 10 digits without country code (e.g. 9876543210)
  if (digitsOnly.length === 10) {
    if (hasLeadingPlus) {
      // "+9876543210" is invalid because + indicates a country code, but country code 98 is Iran, not India
      return {
        isValid: false,
        normalized: null,
        providerFormat: null,
        e164: null,
        masked: null,
        error: 'Invalid country code prefix. Expected +91 for India.'
      };
    }
    nationalTenDigits = digitsOnly;
  }
  // Case B: 11 digits with leading 0 (e.g. 09876543210)
  else if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) {
    if (hasLeadingPlus) {
      return {
        isValid: false,
        normalized: null,
        providerFormat: null,
        e164: null,
        masked: null,
        error: 'Invalid prefix format (+0).'
      };
    }
    nationalTenDigits = digitsOnly.substring(1);
  }
  // Case C: 12 digits with 91 country code (e.g. 919876543210 or +919876543210)
  else if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) {
    nationalTenDigits = digitsOnly.substring(2);
  }
  // Case D: Any other length is malformed (strictly reject naive slice(-10))
  else {
    return {
      isValid: false,
      normalized: null,
      providerFormat: null,
      e164: null,
      masked: null,
      error: `Invalid length for Indian mobile number (${digitsOnly.length} digits found). Expected 10 digits.`
    };
  }

  // TRAI Validation: Indian mobile numbers strictly begin with 6, 7, 8, or 9
  const firstDigit = nationalTenDigits.charAt(0);
  if (!['6', '7', '8', '9'].includes(firstDigit)) {
    return {
      isValid: false,
      normalized: null,
      providerFormat: null,
      e164: null,
      masked: null,
      error: `Invalid Indian mobile number. Mobile numbers must begin with 6, 7, 8, or 9 (starts with ${firstDigit}).`
    };
  }

  // Formatting variants
  const normalized = nationalTenDigits;
  const providerFormat = `91${nationalTenDigits}`;
  const e164 = `+91${nationalTenDigits}`;
  const masked = `+91 ******${nationalTenDigits.slice(-4)}`;

  return {
    isValid: true,
    normalized,
    providerFormat,
    e164,
    masked
  };
}

/**
 * Convenience helper returning boolean validity.
 */
function isValidIndianMobile(rawInput) {
  return normalizeIndianMobile(rawInput).isValid;
}

/**
 * Returns safe redacted phone string for logging or UI.
 * E.g. "+91 ******3210" or "******" if unparseable.
 */
function maskPhoneNumber(rawInput) {
  const result = normalizeIndianMobile(rawInput);
  if (result.isValid && result.masked) {
    return result.masked;
  }
  const str = String(rawInput || '');
  if (str.length >= 4) {
    return `***${str.slice(-4)}`;
  }
  return '******';
}

module.exports = {
  normalizeIndianMobile,
  isValidIndianMobile,
  maskPhoneNumber
};
