const SuperAdminHospital = require('../models/SuperAdminHospital');

/**
 * Resolves trusted hospital branding from MongoDB tenant record.
 * Never trusts client-supplied branding parameters.
 * @param {string} tenantId - The trusted tenant identifier
 * @returns {Promise<{ name: string, logo: string|null, hospitalId: string|null, primaryColor: string }>}
 */
async function resolveTrustedHospitalBranding(tenantId) {
  const fallback = {
    name: 'Curoxa Healthcare',
    logo: null,
    hospitalId: null,
    tenantCode: null,
    primaryColor: '#2563eb',
    isCuroxaDefault: true
  };

  if (!tenantId || tenantId === 'platform' || tenantId === 'default') {
    return fallback;
  }

  try {
    const hospital = await SuperAdminHospital.findOne({
      $or: [
        { code: tenantId },
        { hospitalId: String(tenantId).toUpperCase() }
      ]
    });
    if (hospital) {
      const isImageLogo = hospital.logo && (
        hospital.logo.startsWith('http://') ||
        hospital.logo.startsWith('https://') ||
        hospital.logo.startsWith('data:image/') ||
        hospital.logo.startsWith('/uploads/')
      );

      return {
        name: hospital.name || 'Curoxa Healthcare',
        logo: isImageLogo ? hospital.logo : null,
        hospitalId: hospital.hospitalId || hospital.code,
        tenantCode: hospital.code,
        primaryColor: hospital.theme?.primaryColor || hospital.theme_color || '#2563eb',
        isCuroxaDefault: false
      };
    }
  } catch (err) {
    console.warn('[OTP BRANDING] Error resolving hospital branding for tenant:', tenantId, err.message);
  }

  return fallback;
}

/**
 * Builds white-labeled HTML email template for OTP delivery.
 * @param {Object} params
 * @param {string} params.otp - 6-digit OTP code
 * @param {string} [params.title] - Email heading / title
 * @param {string} [params.message] - Body explanation text
 * @param {Object} params.hospital - Resolved trusted hospital branding
 * @param {number} [params.expiryMinutes=15] - Validity duration in minutes
 * @returns {{ subject: string, text: string, html: string }}
 */
function buildBrandedOtpEmail({ otp, title = 'Verify Your Identity', message, hospital, expiryMinutes = 15 }) {
  const hospitalName = hospital?.name || 'Curoxa Healthcare';
  const logoUrl = hospital?.logo || null;
  const primaryColor = hospital?.primaryColor || '#2563eb';
  
  const subject = `${hospitalName} Verification Code: ${otp}`;
  const text = `Your ${hospitalName} verification code is: ${otp}. This code is valid for ${expiryMinutes} minutes.`;

  const logoMarkup = logoUrl ? `
    <div style="margin-bottom: 16px;">
      <img src="${logoUrl}" alt="${hospitalName}" style="max-height: 48px; max-width: 180px; object-fit: contain; display: inline-block; background: #ffffff; padding: 4px; border-radius: 8px;" />
    </div>
  ` : '';

  const html = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px; text-align: center;">
      <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; text-align: left;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, ${primaryColor} 0%, #1e3a8a 100%); padding: 30px 24px; text-align: center;">
          ${logoMarkup}
          <h1 style="color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.02em;">${hospitalName}</h1>
        </div>
        
        <!-- Body -->
        <div style="padding: 36px 28px; text-align: center;">
          <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 12px; font-size: 20px; font-weight: 600;">${title}</h2>
          <p style="color: #475569; font-size: 14px; line-height: 1.6; margin-bottom: 28px; margin-top: 0;">
            ${message || `You requested a one-time verification code for ${hospitalName}. Use the verification code below to complete the process.`}
            <br/><span style="display:inline-block; margin-top: 8px; font-size: 13px; color: #64748b;">This code is valid for <strong>${expiryMinutes} minutes</strong>.</span>
          </p>
          
          <!-- OTP Box -->
          <div style="background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px 28px; margin-bottom: 28px; display: inline-block;">
            <span style="font-size: 32px; font-weight: 800; color: #1e3a8a; letter-spacing: 6px; font-family: 'Courier New', Courier, monospace;">${otp}</span>
          </div>
          
          <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin: 0;">
            If you did not make this request, please ignore this email. Never share your verification code with anyone.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 24px; text-align: center;">
          <p style="color: #94a3b8; font-size: 11px; margin: 0; line-height: 1.5;">
            &copy; 2026 ${hospitalName}. Powered by Curoxa Healthcare Systems.
          </p>
        </div>
      </div>
    </div>
  `;

  return {
    subject,
    text,
    html,
    toString() {
      return this.html;
    }
  };
}

/**
 * Validates that an authenticating user is authorized to log in through the requested hospital portal.
 * Enforces hospital-wise login isolation (Staff A at Hospital A -> OK, Staff A at Hospital B -> Rejected).
 *
 * @param {Object} user - The user document from MongoDB
 * @param {string} [requestedHospitalId] - The hospitalId or code requested by the login portal
 * @returns {Promise<{ allowed: boolean, message?: string }>}
 */
async function validateHospitalLoginAccess(user, requestedHospitalId) {
  if (!requestedHospitalId || typeof requestedHospitalId !== 'string' || !requestedHospitalId.trim()) {
    return { allowed: true };
  }

  // Super admins have platform-wide access and can authenticate through any portal
  const userRole = String(user?.role || '').toLowerCase();
  if (['superadmin', 'super_admin', 'platform_admin'].includes(userRole)) {
    return { allowed: true };
  }

  const cleanRequestedId = requestedHospitalId.trim();

  // 1. Resolve requested portal's hospital record
  const portalHospital = await SuperAdminHospital.findOne({
    $or: [
      { hospitalId: cleanRequestedId.toUpperCase() },
      { code: cleanRequestedId.toLowerCase() }
    ]
  });

  if (!portalHospital) {
    return {
      allowed: false,
      message: "You are not authorized to log in through this hospital portal."
    };
  }

  // 2. Resolve user's assigned hospital record using user.tenantId
  const userTenant = String(user?.tenantId || '').trim();
  const userHospital = await SuperAdminHospital.findOne({
    $or: [
      { code: userTenant.toLowerCase() },
      { hospitalId: userTenant.toUpperCase() }
    ]
  });

  const portalHospitalId = (portalHospital.hospitalId || '').toUpperCase();
  const portalCode = (portalHospital.code || '').toLowerCase();

  let isMatch = false;

  if (userHospital) {
    const userHospitalId = (userHospital.hospitalId || '').toUpperCase();
    const userCode = (userHospital.code || '').toLowerCase();

    if (portalHospital._id && userHospital._id && portalHospital._id.toString() === userHospital._id.toString()) {
      isMatch = true;
    } else if (portalHospitalId && userHospitalId && portalHospitalId === userHospitalId) {
      isMatch = true;
    } else if (portalCode && userCode && portalCode === userCode) {
      isMatch = true;
    }
  } else {
    // Fallback if hospital not in SuperAdminHospital but user.tenantId matches code directly
    if (userTenant.toLowerCase() === portalCode || userTenant.toUpperCase() === portalHospitalId) {
      isMatch = true;
    }
  }

  if (!isMatch) {
    return {
      allowed: false,
      message: "You are not authorized to log in through this hospital portal."
    };
  }

  return { allowed: true };
}

module.exports = {
  resolveTrustedHospitalBranding,
  buildBrandedOtpEmail,
  validateHospitalLoginAccess
};

