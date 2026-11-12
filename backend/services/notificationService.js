/**
 * UNIFIED NOTIFICATION DISPATCHER SERVICE
 * 
 * Central dispatcher supporting:
 * - EMAIL: Delegated to existing multi-tier infrastructure (Gmail SMTP -> Brevo API -> Resend API)
 * - SMS: Delegated to PING4SMS transactional gateway (Route 4, PNGOTP, TRAI DLT approved template)
 * 
 * Architectural Rules:
 * - Explicit channel selection ('email' | 'sms').
 * - Consistent return contract across all channels.
 * - Zero silent fallbacks from SMS to email unless caller explicitly flags allowFallback: true.
 * - Complete auditability and zero leakage of credentials or plaintext secrets.
 */

const { sendEmail } = require('../utils/emailService');
const { sendOtpSms } = require('./sms/ping4smsService');
const { maskPhoneNumber } = require('../utils/phoneNormalization');

/**
 * Masks an email address for safe logging and response payloads.
 * E.g. "doctor@hospital.org" -> "d***r@hospital.org"
 */
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '******';
  const parts = email.trim().split('@');
  if (parts.length !== 2) return '******';
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) {
    return `${name[0]}*@${domain}`;
  }
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
}

/**
 * Dispatches an OTP verification code via the specified channel.
 * 
 * @param {Object} options
 * @param {'email' | 'sms'} options.channel - Explicit delivery channel
 * @param {string} options.target - Email address or Indian mobile number
 * @param {string|number} options.otp - 6-digit cryptographic OTP code
 * @param {string} [options.tenantId] - Hospital tenant code for isolation
 * @param {string} [options.subject] - Optional custom subject (for email)
 * @param {string} [options.html] - Optional custom HTML body (for email)
 * @param {string} [options.senderName] - Optional custom sender display name
 * @param {boolean} [options.allowFallback=false] - If true, permits email fallback when SMS delivery fails
 * @param {string} [options.fallbackEmail] - Fallback email address required if allowFallback is true
 * @param {Function} [options._mockSmsTransport] - Testing transport override for SMS
 * @param {Function} [options._mockEmailTransport] - Testing transport override for Email
 * @returns {Promise<{
 *   success: boolean,
 *   channel: 'email' | 'sms',
 *   provider: string,
 *   targetMasked: string,
 *   deliveryStatus: 'sent' | 'failed',
 *   messageId?: string,
 *   error?: string,
 *   errorCode?: string
 * }>}
 */
async function sendOtpNotification({
  channel,
  target,
  otp,
  tenantId,
  subject,
  html,
  senderName,
  allowFallback = false,
  fallbackEmail,
  _mockSmsTransport,
  _mockEmailTransport
}) {
  if (!channel || !['email', 'sms'].includes(channel)) {
    return {
      success: false,
      channel: channel || 'unknown',
      provider: 'none',
      targetMasked: '******',
      deliveryStatus: 'failed',
      error: 'Invalid notification channel. Must be "email" or "sms".',
      errorCode: 'INVALID_CHANNEL'
    };
  }

  // ----------------------------------------------------------------
  // CHANNEL 1: SMS (PING4SMS)
  // ----------------------------------------------------------------
  if (channel === 'sms') {
    const maskedTarget = maskPhoneNumber(target);
    const smsResult = await sendOtpSms({
      mobile: target,
      otp,
      tenantId,
      _mockTransport: _mockSmsTransport
    });

    if (smsResult.success) {
      return {
        success: true,
        channel: 'sms',
        provider: smsResult.provider,
        targetMasked: maskedTarget,
        deliveryStatus: 'sent',
        messageId: smsResult.messageId
      };
    }

    // SMS Delivery failed
    console.warn(`[NOTIFICATION] Primary SMS delivery failed for ${maskedTarget}: ${smsResult.error}`);

    // Check for explicit fallback permission
    if (allowFallback && fallbackEmail) {
      const maskedFallback = maskEmail(fallbackEmail);
      console.log(`[NOTIFICATION] Fallback explicitly permitted. Attempting secondary Email dispatch to ${maskedFallback}`);

      const emailResult = await sendOtpNotification({
        channel: 'email',
        target: fallbackEmail,
        otp,
        tenantId,
        subject,
        html,
        senderName,
        allowFallback: false,
        _mockEmailTransport
      });

      return {
        ...emailResult,
        fallbackTriggered: true,
        primaryError: smsResult.error
      };
    }

    // No fallback allowed or configured: Return failure to trigger Zero-Orphan Rollback in caller
    return {
      success: false,
      channel: 'sms',
      provider: 'PING4SMS',
      targetMasked: maskedTarget,
      deliveryStatus: 'failed',
      error: smsResult.error,
      errorCode: smsResult.errorCode || 'SMS_DELIVERY_FAILED'
    };
  }

  // ----------------------------------------------------------------
  // CHANNEL 2: EMAIL (Gmail SMTP -> Brevo API -> Resend API)
  // ----------------------------------------------------------------
  if (channel === 'email') {
    const maskedTarget = maskEmail(target);

    // Resolve authoritative email HTML body:
    // Support template callback (otp) => string, or {{OTP}}/{{CODE}} placeholder replacement, or default
    let renderedHtml = '';
    if (typeof html === 'function') {
      renderedHtml = html(otp);
    } else if (typeof html === 'string' && html.trim().length > 0) {
      renderedHtml = html.replace(/{{OTP}}|{{CODE}}/g, otp);
    } else {
      renderedHtml = `<p>Your verification code is: <strong>${otp}</strong>. Valid for 15 minutes.</p>`;
    }

    // Resolve email subject WITHOUT the OTP
    let renderedSubject = 'Verification Code';
    if (typeof subject === 'function') {
      renderedSubject = subject(otp);
    } else if (typeof subject === 'string' && subject.trim().length > 0) {
      renderedSubject = subject.trim();
    }

    // Enforce security rule: Do not include the OTP in the email subject
    if (otp && typeof renderedSubject === 'string') {
      renderedSubject = renderedSubject
        .replace(new RegExp(`:\\s*${otp}`, 'g'), '')
        .replace(new RegExp(otp, 'g'), '')
        .replace(/:\s*{{OTP}}|:\s*{{CODE}}|{{OTP}}|{{CODE}}/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (!renderedSubject) {
        renderedSubject = 'Verification Code';
      }
    }

    if (_mockEmailTransport && typeof _mockEmailTransport === 'function') {
      return _mockEmailTransport({ 
        target, 
        otp, 
        tenantId, 
        subject: renderedSubject, 
        html: renderedHtml, 
        senderName, 
        maskedTarget 
      });
    }

    try {
      const emailResult = await sendEmail({
        to: target,
        subject: renderedSubject,
        text: `Your verification code is: ${otp}. Valid for 15 minutes.`,
        html: renderedHtml,
        senderName: senderName || 'Quroxa Healthcare'
      });

      const primaryResult = emailResult.results && emailResult.results[0];
      const usedProvider = primaryResult?.provider || (emailResult.success ? 'EMAIL_GATEWAY' : 'NONE');

      if (emailResult.success) {
        return {
          success: true,
          channel: 'email',
          provider: usedProvider,
          targetMasked: maskedTarget,
          deliveryStatus: 'sent'
        };
      }

      return {
        success: false,
        channel: 'email',
        provider: usedProvider,
        targetMasked: maskedTarget,
        deliveryStatus: 'failed',
        error: primaryResult?.error || 'All email providers failed to deliver the message.',
        errorCode: 'EMAIL_DELIVERY_FAILED'
      };
    } catch (err) {
      console.error(`[NOTIFICATION] Email dispatch exception for ${maskedTarget}:`, err.message);
      return {
        success: false,
        channel: 'email',
        provider: 'none',
        targetMasked: maskedTarget,
        deliveryStatus: 'failed',
        error: err.message,
        errorCode: 'EMAIL_DELIVERY_EXCEPTION'
      };
    }
  }
}

module.exports = {
  sendOtpNotification,
  maskEmail
};
