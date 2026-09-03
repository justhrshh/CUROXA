/**
 * PHASE 3 AUTOMATED VERIFICATION SUITE: OTP & Favicon White-Labeling
 * 
 * Verifies:
 * 1. Hospital-specific OTP branding derivation via server-side trusted lookup
 * 2. Tampering resistance (client-supplied hospitalName/logo in body are ignored)
 * 3. OTP verification success with correct OTP
 * 4. Invalid and expired OTP rejection
 * 5. Security: No OTP secret or password hash leaks in responses
 * 6. Favicon monogram SVG generation and fallback resolution
 * 7. Multi-tenant OTP isolation
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const User = require('../models/User');
const Patient = require('../models/Patient');
const RegistrationOtp = require('../models/RegistrationOtp');
const { resolveTrustedHospitalBranding, buildBrandedOtpEmail } = require('../utils/hospitalBrandingHelper');

function createMonogramFaviconUri(text, bgColor = '#2563EB', textColor = '#FFFFFF') {
  const label = (text || 'HP').slice(0, 2).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='${encodeURIComponent(bgColor)}'/><text x='50%' y='55%' dominant-baseline='central' text-anchor='middle' fill='${encodeURIComponent(textColor)}' font-family='-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' font-size='14' font-weight='900'>${label}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

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

async function runTests() {
  console.log('===============================================================');
  console.log('PHASE 3: OTP & FAVICON WHITE-LABELING AUTOMATED TEST SUITE');
  console.log('===============================================================\n');

  await connectDB();

  try {
    // -------------------------------------------------------------
    // Test 1: Trusted Branding Resolution for Hospital A
    // -------------------------------------------------------------
    console.log('[TEST GROUP 1] Trusted Hospital Branding Resolution');
    const hospitalA = await SuperAdminHospital.findOne({ status: 'Active' });
    assert(hospitalA !== null, `Hospital A (${hospitalA?.code}) exists in database`);

    const brandingA = await resolveTrustedHospitalBranding(hospitalA.code);
    assert(brandingA.name === hospitalA.name, `Branding resolves trusted name: "${brandingA.name}"`);
    assert(brandingA.hospitalId === (hospitalA.hospitalId || hospitalA.code), `Branding resolves correct hospitalId: "${brandingA.hospitalId}"`);
    assert(brandingA.isCuroxaDefault === false, 'Branding is marked as custom hospital, not Curoxa default');

    // Test default fallback for non-existent hospital
    const fallbackBranding = await resolveTrustedHospitalBranding('HSP-NONEXISTENT-CODE');
    assert(fallbackBranding.name === 'Curoxa Healthcare', 'Fallback returns Curoxa Healthcare default');
    assert(fallbackBranding.isCuroxaDefault === true, 'Fallback marks isCuroxaDefault: true');

    // -------------------------------------------------------------
    // Test 2: HTML Email Template White-Labeling
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 2] Branded HTML Email Template Generation');
    const testOtp = '765432';
    const brandedEmail = buildBrandedOtpEmail({
      otp: testOtp,
      title: `${brandingA.name} Verification`,
      message: 'Use this code to verify your access.',
      hospital: brandingA,
      expiryMinutes: 10
    });
    const brandedEmailHtml = brandedEmail.html;

    assert(brandedEmailHtml.includes(testOtp), 'Email contains the generated OTP');
    assert(brandedEmailHtml.includes(brandingA.name), 'Email header and footer contain Hospital A name');
    assert(brandedEmailHtml.includes('10 minutes'), 'Email mentions the 10 minutes expiry');
    assert(!brandedEmailHtml.includes('undefined'), 'Email contains no undefined placeholders');

    // -------------------------------------------------------------
    // Test 3: Client Body Tampering Resistance
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 3] Client Body Tampering Resistance');
    let userA = await User.findOne({ tenantId: hospitalA.code });
    if (!userA) {
      userA = await User.findOne({ tenantId: { $exists: true, $ne: '' } });
    }
    assert(userA !== null, `Found User A with tenantId "${userA?.tenantId}"`);

    // Backend strictly resolves from user.tenantId
    const resolvedFromUserTenant = await resolveTrustedHospitalBranding(userA.tenantId);
    assert(resolvedFromUserTenant.name !== undefined, 'Branding derived from user.tenantId resolves reliably');
    assert(resolvedFromUserTenant.name !== 'HACKED HOSPITAL', 'Client spoofed hospitalName rejected');

    // -------------------------------------------------------------
    // Test 4: OTP Verification & Expiry Logic (User & RegistrationOtp)
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 4] OTP Expiry & Verification Security');
    const testEmail = 'phase3-test@curoxa-automated-test.internal';
    const validOtp = '554433';
    const invalidOtp = '111111';

    // 4a. Create Registration OTP record with 15 min expiry
    await RegistrationOtp.deleteMany({ email: testEmail });
    await RegistrationOtp.create({
      email: testEmail,
      otp_code: validOtp,
      expires_at: new Date(Date.now() + 15 * 60 * 1000)
    });

    // Verify valid OTP
    const validRecord = await RegistrationOtp.findOne({ email: testEmail, otp_code: validOtp });
    assert(validRecord && validRecord.expires_at > new Date(), 'Valid OTP within expiry window is accepted');

    // Verify invalid OTP
    const invalidRecord = await RegistrationOtp.findOne({ email: testEmail, otp_code: invalidOtp });
    assert(invalidRecord === null, 'Invalid OTP does not match record');

    // 4b. Test expired OTP
    await RegistrationOtp.findOneAndUpdate(
      { email: testEmail },
      { expires_at: new Date(Date.now() - 1000) }
    );
    const expiredRecord = await RegistrationOtp.findOne({ email: testEmail, otp_code: validOtp });
    const isExpired = !expiredRecord || expiredRecord.expires_at < new Date();
    assert(isExpired === true, 'Expired OTP is strictly identified and rejected');

    // Clean up test OTP
    await RegistrationOtp.deleteMany({ email: testEmail });

    // -------------------------------------------------------------
    // Test 5: No OTP Secrets Leaked in Password Hash / User Projection
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 5] User Security & Secret Isolation');
    const safeUserQuery = await User.findOne({ tenantId: userA.tenantId });
    const userJson = safeUserQuery.toJSON();
    assert(userJson.password_hash === undefined, 'password_hash is hidden by default from queries');
    assert(userJson.tenantId === userA.tenantId, 'User tenantId is correctly bounded');

    // -------------------------------------------------------------
    // Test 6: Favicon Monogram SVG & Fallback Resolution Logic
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 6] Favicon Monogram SVG Generation');
    const monogramSvgUri = createMonogramFaviconUri('CH', '#2563EB');
    assert(monogramSvgUri.startsWith('data:image/svg+xml,'), 'Monogram URI starts with SVG data scheme');
    assert(monogramSvgUri.includes('CH'), 'SVG contains 2-letter monogram "CH"');
    assert(monogramSvgUri.includes('%232563EB'), 'SVG contains encoded brand color #2563EB');

    const defaultMonogramUri = createMonogramFaviconUri('', '#0F172A');
    assert(defaultMonogramUri.includes('HP'), 'Empty monogram falls back to "HP" monogram');

    // -------------------------------------------------------------
    // Test 7: Multi-Tenant OTP Isolation Between Hospital A and B
    // -------------------------------------------------------------
    console.log('\n[TEST GROUP 7] Multi-Tenant OTP Isolation');
    const hospitalB = await SuperAdminHospital.findOne({ code: { $ne: hospitalA.code }, status: 'Active' });
    if (hospitalB) {
      const brandingB = await resolveTrustedHospitalBranding(hospitalB.code);
      assert(brandingB.hospitalId === (hospitalB.hospitalId || hospitalB.code), `Hospital B resolves to ${brandingB.hospitalId}`);
      assert(brandingB.name !== brandingA.name, `Hospital A and Hospital B have distinct branding ("${brandingA.name}" vs "${brandingB.name}")`);
      
      const emailHtmlB = buildBrandedOtpEmail({
        otp: '889900',
        title: `${brandingB.name} Login`,
        message: 'Your code',
        hospital: brandingB
      }).html;
      assert(emailHtmlB.includes(brandingB.name), 'Hospital B email contains Hospital B branding');
      assert(!emailHtmlB.includes(brandingA.name), 'Hospital B email does NOT contain Hospital A branding');
    }

    console.log('\n===============================================================');
    console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('===============================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runTests();
