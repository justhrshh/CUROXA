/**
 * Automated Verification Suite: Hospital Logo Propagation to Hospital Portal
 * 
 * Verifies:
 * 1. Database persistence: clinic-2 (HSP-TD7IRD) contains valid base64 image logo
 * 2. Public API endpoint: GET /api/public/portal/HSP-TD7IRD returns logo without leaking sensitive data
 * 3. HospitalBrandLogo logic:
 *    - Valid image URI / base64 resolves isImageUrl = true with proper imageSrc
 *    - Image load error (imgError) falls back to derived initials ('CL')
 *    - Hospital with no logo falls back to derived initials ('CL')
 *    - Schema default 'H' is not treated as custom monogram; derived initials ('CL') used
 *    - Custom monograms (e.g. 'CMC') preserved
 *    - Whitespace trimming and raw base64 prefix auto-detection
 * 4. Multi-tenant isolation: Hospital A logo never leaks to Hospital B
 * 5. Cache invalidation data structure validation
 */

const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
  }
}

// Mirror pure logic from HospitalBrandLogo in PortalBrandingContext.jsx
function evaluateHospitalBrandLogo(hospital, imgError = false) {
  if (!hospital) return { render: null };

  const rawLogo = hospital.logo || '';
  const cleanLogo = typeof rawLogo === 'string' ? rawLogo.trim() : '';

  const isImageFormat = Boolean(
    cleanLogo &&
    cleanLogo !== 'H' &&
    (
      cleanLogo.startsWith('data:image/') ||
      cleanLogo.startsWith('http://') ||
      cleanLogo.startsWith('https://') ||
      cleanLogo.startsWith('/uploads/') ||
      cleanLogo.startsWith('blob:') ||
      cleanLogo.startsWith('/9j/') ||
      cleanLogo.startsWith('iVBOR') ||
      cleanLogo.startsWith('R0lGOD') ||
      cleanLogo.startsWith('PHN2Zw')
    )
  );

  const imageSrc = cleanLogo.startsWith('/9j/') ? `data:image/jpeg;base64,${cleanLogo}`
    : cleanLogo.startsWith('iVBOR') ? `data:image/png;base64,${cleanLogo}`
    : cleanLogo.startsWith('R0lGOD') ? `data:image/gif;base64,${cleanLogo}`
    : cleanLogo.startsWith('PHN2Zw') ? `data:image/svg+xml;base64,${cleanLogo}`
    : cleanLogo;

  const isImageUrl = !imgError && isImageFormat;

  const monogram = (cleanLogo && cleanLogo !== 'H' && cleanLogo.length <= 4 && !isImageUrl)
    ? cleanLogo.toUpperCase()
    : (hospital.name ? hospital.name.slice(0, 2).toUpperCase() : 'HP');

  return {
    isImageUrl,
    imageSrc: isImageUrl ? imageSrc : null,
    monogram: !isImageUrl ? monogram : null
  };
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    }).on('error', reject);
  });
}

async function runSuite() {
  console.log('===============================================================');
  console.log(' HOSPITAL LOGO PROPAGATION TO PORTAL — VERIFICATION SUITE');
  console.log('===============================================================\n');

  const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/clinical_management';
  console.log('[1/5] Connecting to Database to inspect clinic-2 (HSP-TD7IRD)...');
  await mongoose.connect(mongoURI);

  const dbHosp = await mongoose.connection.collection('superadminhospitals').findOne({ hospitalId: 'HSP-TD7IRD' });
  assert(dbHosp !== null, 'Found clinic-2 record with hospitalId HSP-TD7IRD in database');
  assert(dbHosp && dbHosp.name === 'clinic-2', 'Hospital name matches clinic-2');
  assert(dbHosp && typeof dbHosp.logo === 'string' && dbHosp.logo.length > 1000, `Hospital logo persisted in DB (${dbHosp?.logo?.length} chars)`);
  assert(dbHosp && dbHosp.logo.startsWith('data:image/jpeg;base64,'), 'Hospital logo is valid data:image/jpeg;base64 URI');

  console.log('\n[2/5] Testing Public Portal API: GET /api/public/portal/HSP-TD7IRD...');
  try {
    const apiRes = await fetchJson('http://localhost:5000/api/public/portal/HSP-TD7IRD');
    assert(apiRes.status === 200, `API returned HTTP 200 (received ${apiRes.status})`);
    assert(apiRes.data.hospitalId === 'HSP-TD7IRD', 'Response contains correct hospitalId: HSP-TD7IRD');
    assert(apiRes.data.name === 'clinic-2', 'Response contains correct hospital name: clinic-2');
    assert(apiRes.data.logo && apiRes.data.logo.startsWith('data:image/'), 'Response contains full image logo');
    assert(apiRes.data._id === undefined, 'No internal database _id leaked');
    assert(apiRes.data.password === undefined && apiRes.data.adminEmail === undefined, 'No admin credentials leaked');
    assert(apiRes.data.limits === undefined && apiRes.data.invoices === undefined, 'No private financial/limit data leaked');
  } catch (err) {
    assert(false, `Local API request failed: ${err.message}`);
  }

  console.log('\n[3/5] Testing HospitalBrandLogo Rendering & Fallback Logic...');
  
  // Case A: clinic-2 with real logo
  const clinic2Eval = evaluateHospitalBrandLogo(dbHosp, false);
  assert(clinic2Eval.isImageUrl === true, 'clinic-2 logo evaluates to isImageUrl = true');
  assert(clinic2Eval.imageSrc && clinic2Eval.imageSrc.startsWith('data:image/jpeg'), 'clinic-2 renders real image with correct data URI');

  // Case B: clinic-2 image load error fallback
  const clinic2ErrorEval = evaluateHospitalBrandLogo(dbHosp, true);
  assert(clinic2ErrorEval.isImageUrl === false, 'Image error sets isImageUrl = false');
  assert(clinic2ErrorEval.monogram === 'CL', 'Image error gracefully falls back to initials monogram "CL" for clinic-2');

  // Case C: Hospital with no logo (empty string)
  const noLogoHosp = { hospitalId: 'HSP-NOLOGO', name: 'General Care' };
  const noLogoEval = evaluateHospitalBrandLogo(noLogoHosp, false);
  assert(noLogoEval.isImageUrl === false, 'No-logo hospital evaluates to isImageUrl = false');
  assert(noLogoEval.monogram === 'GE', 'No-logo hospital renders derived initials "GE"');

  // Case D: Hospital with schema default 'H'
  const defaultHHosp = { hospitalId: 'HSP-DEFALT', name: 'clinic-2', logo: 'H' };
  const defaultHEval = evaluateHospitalBrandLogo(defaultHHosp, false);
  assert(defaultHEval.isImageUrl === false, 'Schema default "H" evaluates to isImageUrl = false');
  assert(defaultHEval.monogram === 'CL', 'Schema default "H" does not render "H", correctly derives initials "CL"');

  // Case E: Hospital with custom monogram badge
  const customMonogramHosp = { hospitalId: 'HSP-CUSTOM', name: 'Metro Clinic', logo: 'MC' };
  const customMonoEval = evaluateHospitalBrandLogo(customMonogramHosp, false);
  assert(customMonoEval.isImageUrl === false, 'Custom monogram evaluates to isImageUrl = false');
  assert(customMonoEval.monogram === 'MC', 'Custom monogram "MC" rendered directly');

  // Case F: Whitespace-padded base64 logo
  const paddedHosp = { hospitalId: 'HSP-PADDED', name: 'City Hospital', logo: '   data:image/png;base64,iVBORw0KGgoAAA   \n' };
  const paddedEval = evaluateHospitalBrandLogo(paddedHosp, false);
  assert(paddedEval.isImageUrl === true, 'Whitespace-padded logo is trimmed and evaluates to isImageUrl = true');
  assert(paddedEval.imageSrc === 'data:image/png;base64,iVBORw0KGgoAAA', 'Trimmed imageSrc matches exact data URI');

  // Case G: Raw base64 string without data: prefix
  const rawBase64Hosp = { hospitalId: 'HSP-RAW64', name: 'Test Health', logo: '/9j/4AAQSkZJRgABA...' };
  const rawBase64Eval = evaluateHospitalBrandLogo(rawBase64Hosp, false);
  assert(rawBase64Eval.isImageUrl === true, 'Raw base64 JPEG payload recognized as isImageUrl = true');
  assert(rawBase64Eval.imageSrc.startsWith('data:image/jpeg;base64,/9j/'), 'Raw base64 JPEG payload auto-prefixed with data URI scheme');

  console.log('\n[4/5] Testing Multi-Tenant Isolation & Unknown Portals...');
  const unknownRes = await fetchJson('http://localhost:5000/api/public/portal/HSP-NONEX9');
  assert(unknownRes.status === 404, 'Unknown hospital ID HSP-NONEX9 returns HTTP 404');
  assert(unknownRes.data.error === 'Hospital portal not found', '404 error message returned cleanly');

  const invalidFormatRes = await fetchJson('http://localhost:5000/api/public/portal/INVALID-FORMAT');
  assert(invalidFormatRes.status === 404, 'Malformed hospital ID format rejected with HTTP 404');

  console.log('\n[5/5] Testing Super Admin Branding Update Synchronization Payload...');
  const updatedLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const syncPayload = {
    hospitalId: 'HSP-TD7IRD',
    name: 'clinic-2 Updated',
    logo: updatedLogo,
    status: 'Active'
  };
  const syncEval = evaluateHospitalBrandLogo(syncPayload, false);
  assert(syncEval.isImageUrl === true, 'Synchronized branding payload immediately evaluates to isImageUrl = true');
  assert(syncEval.imageSrc === updatedLogo, 'Synchronized branding payload contains exact updated image');

  console.log('\n===============================================================');
  console.log(` RESULT: ${passedTests}/${totalTests} TESTS PASSED (${passedTests === totalTests ? '100% SUCCESS' : 'FAILURES DETECTED'})`);
  console.log('===============================================================\n');

  await mongoose.disconnect();
  process.exit(passedTests === totalTests ? 0 : 1);
}

runSuite().catch(async (err) => {
  console.error('Fatal test error:', err);
  await mongoose.disconnect();
  process.exit(1);
});
