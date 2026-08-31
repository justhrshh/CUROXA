const nodemailer = require("nodemailer");
const https = require("https");

/**
 * Sends an email using SMTP with automatic failover to Brevo API and Resend API.
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} [options.text] - Plain text content
 * @param {string} [options.html] - HTML email content
 * @returns {Promise<{ success: boolean, results: Array<{ recipient: string, success: boolean, provider?: string, error?: string }> }>}
 */
async function sendEmail({ to, subject, text, html }) {
  const recipients = Array.isArray(to) ? to : [to];
  const results = [];

  for (const recipient of recipients) {
    let emailSent = false;
    let usedProvider = null;
    let lastError = null;

    // 1. Try Brevo HTTP API first (High deliverability transactional relay, bypasses SMTP spam filtering & port blocks)
    if (process.env.BREVO_API_KEY) {
      try {
        const plainText = (text && text.trim())
          ? text.trim()
          : (html ? html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : (subject || "Curoxa Notification"));

        const senderEmail = process.env.SMTP_USER || "curoxatechnology@gmail.com";
        const senderName = "Curoxa Healthcare";

        const payload = JSON.stringify({
          sender: { 
            name: senderName, 
            email: senderEmail 
          },
          to: [{ email: recipient }],
          replyTo: {
            name: senderName,
            email: senderEmail
          },
          headers: {
            "X-Mailin-Tag": "transactional-auth"
          },
          subject,
          textContent: plainText,
          htmlContent: html || `<p>${plainText}</p>`
        });
        const options = {
          hostname: 'api.brevo.com',
          port: 443,
          path: '/v3/smtp/email',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': process.env.BREVO_API_KEY.trim(),
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: 8000
        };
        await new Promise((resolve, reject) => {
          const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) resolve();
              else reject(new Error(`Brevo API status ${res.statusCode}: ${data}`));
            });
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(new Error('Brevo request timed out')); });
          req.write(payload);
          req.end();
        });
        emailSent = true;
        usedProvider = "Brevo API";
        console.log(`[EMAIL] Email successfully delivered via Brevo API to ${recipient}`);
      } catch (brevoError) {
        lastError = brevoError.message;
        console.error(`[EMAIL] Brevo failed for ${recipient}:`, brevoError.message);
      }
    }

    // 2. Try SMTP fallback (Gmail / Custom SMTP)
    if (!emailSent && process.env.SMTP_USER && process.env.SMTP_PASS) {
      try {
        const smtpConfig = {
          host: process.env.SMTP_HOST || "smtp.gmail.com",
          port: parseInt(process.env.SMTP_PORT, 10) || 465,
          secure: process.env.SMTP_SECURE === "true" || parseInt(process.env.SMTP_PORT, 10) === 465,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          },
          connectionTimeout: 6000,
          greetingTimeout: 6000,
          socketTimeout: 8000
        };
        const transporter = nodemailer.createTransport(smtpConfig);
        await transporter.sendMail({
          from: process.env.SMTP_FROM || `"Curoxa Healthcare" <${process.env.SMTP_USER}>`,
          to: recipient,
          replyTo: `"Curoxa Healthcare" <${process.env.SMTP_USER}>`,
          subject,
          text: plainText,
          html: html || text || ""
        });
        emailSent = true;
        usedProvider = "SMTP";
        console.log(`[EMAIL] Email successfully sent via SMTP to ${recipient}`);
      } catch (smtpError) {
        lastError = smtpError.message;
        console.error(`[EMAIL] SMTP failed for ${recipient}:`, smtpError.message);
      }
    }

    // 3. Try Resend HTTP API
    if (!emailSent && process.env.RESEND_API_KEY) {
      try {
        const fromAddress = process.env.RESEND_FROM || "onboarding@resend.dev";
        const payload = JSON.stringify({
          from: fromAddress,
          to: [recipient],
          subject,
          text: text || undefined,
          html: html || text || ""
        });
        const options = {
          hostname: 'api.resend.com',
          port: 443,
          path: '/emails',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.RESEND_API_KEY.trim()}`,
            'Content-Length': Buffer.byteLength(payload)
          },
          timeout: 8000
        };
        await new Promise((resolve, reject) => {
          const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
              if (res.statusCode >= 200 && res.statusCode < 300) resolve();
              else reject(new Error(`Resend API status ${res.statusCode}: ${data}`));
            });
          });
          req.on('error', reject);
          req.on('timeout', () => { req.destroy(new Error('Resend request timed out')); });
          req.write(payload);
          req.end();
        });
        emailSent = true;
        usedProvider = "Resend API";
        console.log(`[EMAIL] Email successfully sent via Resend API to ${recipient}`);
      } catch (resendError) {
        lastError = resendError.message;
        console.error(`[EMAIL] Resend failed for ${recipient}:`, resendError.message);
      }
    }

    if (!emailSent) {
      console.warn(`[EMAIL] All email delivery providers failed for ${recipient}`);
    }

    results.push({
      recipient,
      success: emailSent,
      provider: usedProvider,
      error: emailSent ? undefined : (lastError || "No email provider configured")
    });
  }

  const allSuccess = results.length > 0 && results.every(r => r.success);
  return { success: allSuccess, results };
}

module.exports = { sendEmail };
