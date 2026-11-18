/**
 * QUROXA — RUNTIME VERIFICATION OF ALL THREE CLINIC LOGO UPLOAD WORKFLOWS
 *
 * Verifies live execution against real Express route pipeline, MongoDB, and Cloudflare R2:
 * 1. Hospital Profile logo upload (POST /api/superadmin/hospitals/:id/logo)
 * 2. SuperAdmin onboarding wizard logo upload (POST /api/superadmin/process-logo)
 * 3. SuperAdmin quick-edit logo upload (POST /api/superadmin/hospitals/:id/logo)
 *
 * Security & invariant tests:
 * - Missing token => 401
 * - Expired token => 401
 * - Non-SuperAdmin token => 403
 *
 * Cleans up all synthetic R2 objects and test database records.
 */

const path = require('path');
const fs = require('fs');
const http = require('http');
const assert = require('assert');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const axios = require('axios');
const FormData = require('form-data');
const { DeleteObjectCommand } = require('@aws-sdk/client-s3');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { getJwtSecret } = require('../config/env');
const secret = getJwtSecret();
const r2 = require('../config/r2');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const superAdminRoutes = require('../routes/superAdminRoutes');

const results = {
  workflow1: { name: 'Hospital Profile Logo Upload', status: 'PENDING', httpStatus: null, details: null },
  workflow2: { name: 'SuperAdmin Onboarding Wizard Logo Upload', status: 'PENDING', httpStatus: null, details: null },
  workflow3: { name: 'SuperAdmin Quick-Edit Logo Upload', status: 'PENDING', httpStatus: null, details: null },
  authRejections: { name: 'Authentication Invariant Rejections (401/403)', status: 'PENDING', checks: [] }
};

const uploadedR2Keys = [];
let testHospitalDoc = null;
let serverInstance = null;
let baseUrl = '';

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/superadmin', superAdminRoutes);

  return new Promise((resolve) => {
    serverInstance = app.listen(0, '127.0.0.1', () => {
      const port = serverInstance.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      console.log(`[TEST SERVER] Live test Express instance listening at ${baseUrl}`);
      resolve();
    });
  });
}

async function cleanupR2Object(url) {
  if (!url || typeof url !== 'string') return;
  const publicDomain = r2.getR2PublicDomain();
  if (url.startsWith(publicDomain)) {
    const key = url.replace(`${publicDomain}/`, '');
    try {
      const bucket = r2.getR2PublicBucket();
      await r2.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: key
      }));
      console.log(`  [CLEANUP] Deleted synthetic R2 object: ${key}`);
    } catch (err) {
      console.warn(`  [CLEANUP WARNING] Failed to delete synthetic R2 object: ${key} (${err.message})`);
    }
  }
}

async function run() {
  console.log('======================================================================');
  console.log('  QUROXA: FINAL RUNTIME VERIFICATION OF LOGO UPLOAD WORKFLOWS         ');
  console.log('======================================================================\n');

  try {
    // Connect to MongoDB
    console.log('[INIT] Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000
    });
    console.log('[INIT] Connected to MongoDB Atlas successfully.');

    // Start local express server
    await startServer();

    // Verify R2 configuration
    assert(r2.isR2Configured(), 'Cloudflare R2 must be fully configured');
    const expectedPublicDomain = 'https://pub-8936c3a181da4ddf9643d64092a57430.r2.dev';
    assert.strictEqual(r2.getR2PublicDomain(), expectedPublicDomain, 'R2 public domain must match expected');
    assert.strictEqual(r2.getR2PublicBucket(), 'quroxa-public-assets', 'R2 public bucket must be quroxa-public-assets');

    // Create synthetic PNG logo with transparency
    console.log('[INIT] Generating synthetic test logo...');
    const syntheticLogoBuffer = await sharp({
      create: {
        width: 160,
        height: 80,
        channels: 4,
        background: { r: 14, g: 165, b: 233, alpha: 0.85 }
      }
    }).png().toBuffer();

    // Create synthetic test hospital in MongoDB
    console.log('[INIT] Creating temporary synthetic test clinic in MongoDB...');
    testHospitalDoc = await SuperAdminHospital.create({
      name: 'Synthetic Test Clinic Runtime',
      code: `SYNTH-${Date.now().toString().slice(-6)}`,
      hospitalId: `HSP-SYN${Date.now().toString().slice(-3)}`,
      logo: 'H',
      status: 'Active',
      plan: 'Enterprise Elite (₹50,000/mo)'
    });
    console.log(`[INIT] Temporary clinic created with code: ${testHospitalDoc.code}, _id: ${testHospitalDoc._id}`);

    // Generate tokens (JWT secrets never printed)
    const superAdminToken = jwt.sign(
      { id: 'usr_super_runtime', staff_id: 'superadmin', role: 'superadmin', email: 'super.admin@curoxa.com' },
      secret,
      { expiresIn: '1h' }
    );
    const expiredToken = jwt.sign(
      { id: 'usr_super_expired', staff_id: 'superadmin', role: 'superadmin' },
      secret,
      { expiresIn: '-1h' }
    );
    const doctorToken = jwt.sign(
      { id: new mongoose.Types.ObjectId().toString(), staff_id: 'doc_runtime', role: 'doctor' },
      secret,
      { expiresIn: '1h' }
    );

    // ---------------------------------------------------------------
    // WORKFLOW 1: Hospital Profile Logo Upload
    // ---------------------------------------------------------------
    console.log('\n---------------------------------------------------------------');
    console.log('WORKFLOW 1: Hospital Profile Logo Upload (/api/superadmin/hospitals/:id/logo)');
    console.log('---------------------------------------------------------------');
    try {
      const form1 = new FormData();
      form1.append('logo', syntheticLogoBuffer, {
        filename: 'synthetic_hospital_profile_logo.png',
        contentType: 'image/png'
      });

      const reqHeaders1 = {
        ...form1.getHeaders(),
        'Authorization': `Bearer ${superAdminToken}`
      };

      // Header verification
      assert(reqHeaders1['Authorization'] && reqHeaders1['Authorization'].startsWith('Bearer '),
        'Outgoing request must contain Authorization Bearer header');
      assert(!reqHeaders1['Authorization'].includes('undefined'), 'Authorization header must not contain undefined');
      console.log('  ✓ Outgoing request verified: Authorization Bearer header present (token redacted)');

      const res1 = await axios.post(
        `${baseUrl}/api/superadmin/hospitals/${testHospitalDoc._id}/logo`,
        form1,
        { headers: reqHeaders1 }
      );

      results.workflow1.httpStatus = res1.status;
      assert.strictEqual(res1.status, 200, `Expected HTTP 200, got ${res1.status}`);
      assert.strictEqual(res1.data.success, true, 'Expected success: true');
      assert(res1.data.logoUrl && res1.data.logoUrl.startsWith(expectedPublicDomain),
        `logoUrl must point to R2 public domain (${res1.data.logoUrl})`);
      console.log(`  ✓ Backend accepted request with HTTP 200 OK`);
      console.log(`  ✓ Cloudflare R2 public logo URL: ${res1.data.logoUrl}`);
      console.log(`  ✓ Image processing status: ${res1.data.processingStatus}, dimensions: ${res1.data.dimensions?.width}x${res1.data.dimensions?.height}`);

      uploadedR2Keys.push(res1.data.logoUrl);
      if (res1.data.originalLogoUrl) uploadedR2Keys.push(res1.data.originalLogoUrl);

      // Verify the image loads successfully via HTTP GET
      console.log(`  [PROBE] Verifying image URL is reachable via HTTP GET...`);
      const imgRes1 = await axios.get(res1.data.logoUrl, { responseType: 'arraybuffer', timeout: 10000 });
      assert.strictEqual(imgRes1.status, 200, 'Image GET must return HTTP 200');
      assert(imgRes1.data.length > 0, 'Image payload must be non-empty');
      console.log(`  ✓ Image successfully loaded from R2 public domain (${imgRes1.data.length} bytes, HTTP 200)`);

      results.workflow1.status = 'PASS';
      results.workflow1.details = `HTTP 200 | URL: ${res1.data.logoUrl} | Dimensions: ${res1.data.dimensions?.width}x${res1.data.dimensions?.height}`;
    } catch (err) {
      results.workflow1.status = 'FAIL';
      results.workflow1.httpStatus = err.response?.status || 'ERR';
      results.workflow1.details = err.response?.data?.error || err.message;
      console.error(`  ✗ Workflow 1 Failed:`, results.workflow1.details);
    }

    // ---------------------------------------------------------------
    // WORKFLOW 2: SuperAdmin Onboarding Wizard Logo Upload
    // ---------------------------------------------------------------
    console.log('\n---------------------------------------------------------------');
    console.log('WORKFLOW 2: Onboarding Wizard Logo Upload (/api/superadmin/process-logo)');
    console.log('---------------------------------------------------------------');
    try {
      const form2 = new FormData();
      form2.append('logo', syntheticLogoBuffer, {
        filename: 'synthetic_wizard_logo.png',
        contentType: 'image/png'
      });
      form2.append('hospitalCode', 'WIZARD-SYNTH-01');

      const reqHeaders2 = {
        ...form2.getHeaders(),
        'Authorization': `Bearer ${superAdminToken}`
      };

      assert(reqHeaders2['Authorization'] && reqHeaders2['Authorization'].startsWith('Bearer '),
        'Outgoing request must contain Authorization Bearer header');
      console.log('  ✓ Outgoing request verified: Authorization Bearer header present (token redacted)');

      const res2 = await axios.post(
        `${baseUrl}/api/superadmin/process-logo`,
        form2,
        { headers: reqHeaders2 }
      );

      results.workflow2.httpStatus = res2.status;
      assert.strictEqual(res2.status, 200, `Expected HTTP 200, got ${res2.status}`);
      assert.strictEqual(res2.data.success, true, 'Expected success: true');
      assert(res2.data.logoUrl && res2.data.logoUrl.startsWith(expectedPublicDomain),
        `logoUrl must point to R2 public domain (${res2.data.logoUrl})`);
      console.log(`  ✓ Backend accepted request with HTTP 200 OK`);
      console.log(`  ✓ Cloudflare R2 public logo URL: ${res2.data.logoUrl}`);
      console.log(`  ✓ Processing status: ${res2.data.processingStatus}, dimensions: ${res2.data.dimensions?.width}x${res2.data.dimensions?.height}`);

      uploadedR2Keys.push(res2.data.logoUrl);
      if (res2.data.originalLogoUrl) uploadedR2Keys.push(res2.data.originalLogoUrl);

      // Verify the image loads successfully via HTTP GET
      console.log(`  [PROBE] Verifying image URL is reachable via HTTP GET...`);
      const imgRes2 = await axios.get(res2.data.logoUrl, { responseType: 'arraybuffer', timeout: 10000 });
      assert.strictEqual(imgRes2.status, 200, 'Image GET must return HTTP 200');
      assert(imgRes2.data.length > 0, 'Image payload must be non-empty');
      console.log(`  ✓ Image successfully loaded from R2 public domain (${imgRes2.data.length} bytes, HTTP 200)`);

      results.workflow2.status = 'PASS';
      results.workflow2.details = `HTTP 200 | URL: ${res2.data.logoUrl} | Dimensions: ${res2.data.dimensions?.width}x${res2.data.dimensions?.height}`;
    } catch (err) {
      results.workflow2.status = 'FAIL';
      results.workflow2.httpStatus = err.response?.status || 'ERR';
      results.workflow2.details = err.response?.data?.error || err.message;
      console.error(`  ✗ Workflow 2 Failed:`, results.workflow2.details);
    }

    // ---------------------------------------------------------------
    // WORKFLOW 3: SuperAdmin Quick-Edit Logo Upload
    // ---------------------------------------------------------------
    console.log('\n---------------------------------------------------------------');
    console.log('WORKFLOW 3: SuperAdmin Quick-Edit Logo Upload (/api/superadmin/hospitals/:id/logo)');
    console.log('---------------------------------------------------------------');
    try {
      const form3 = new FormData();
      form3.append('logo', syntheticLogoBuffer, {
        filename: 'synthetic_quickedit_logo.png',
        contentType: 'image/png'
      });
      form3.append('hospitalCode', testHospitalDoc.code);

      const reqHeaders3 = {
        ...form3.getHeaders(),
        'Authorization': `Bearer ${superAdminToken}`
      };

      assert(reqHeaders3['Authorization'] && reqHeaders3['Authorization'].startsWith('Bearer '),
        'Outgoing request must contain Authorization Bearer header');
      console.log('  ✓ Outgoing request verified: Authorization Bearer header present (token redacted)');

      const res3 = await axios.post(
        `${baseUrl}/api/superadmin/hospitals/${testHospitalDoc.code}/logo`,
        form3,
        { headers: reqHeaders3 }
      );

      results.workflow3.httpStatus = res3.status;
      assert.strictEqual(res3.status, 200, `Expected HTTP 200, got ${res3.status}`);
      assert.strictEqual(res3.data.success, true, 'Expected success: true');
      assert(res3.data.logoUrl && res3.data.logoUrl.startsWith(expectedPublicDomain),
        `logoUrl must point to R2 public domain (${res3.data.logoUrl})`);
      console.log(`  ✓ Backend accepted request with HTTP 200 OK`);
      console.log(`  ✓ Cloudflare R2 public logo URL: ${res3.data.logoUrl}`);
      console.log(`  ✓ Processing status: ${res3.data.processingStatus}, dimensions: ${res3.data.dimensions?.width}x${res3.data.dimensions?.height}`);

      uploadedR2Keys.push(res3.data.logoUrl);
      if (res3.data.originalLogoUrl) uploadedR2Keys.push(res3.data.originalLogoUrl);

      // Verify the image loads successfully via HTTP GET
      console.log(`  [PROBE] Verifying image URL is reachable via HTTP GET...`);
      const imgRes3 = await axios.get(res3.data.logoUrl, { responseType: 'arraybuffer', timeout: 10000 });
      assert.strictEqual(imgRes3.status, 200, 'Image GET must return HTTP 200');
      assert(imgRes3.data.length > 0, 'Image payload must be non-empty');
      console.log(`  ✓ Image successfully loaded from R2 public domain (${imgRes3.data.length} bytes, HTTP 200)`);

      results.workflow3.status = 'PASS';
      results.workflow3.details = `HTTP 200 | URL: ${res3.data.logoUrl} | Dimensions: ${res3.data.dimensions?.width}x${res3.data.dimensions?.height}`;
    } catch (err) {
      results.workflow3.status = 'FAIL';
      results.workflow3.httpStatus = err.response?.status || 'ERR';
      results.workflow3.details = err.response?.data?.error || err.message;
      console.error(`  ✗ Workflow 3 Failed:`, results.workflow3.details);
    }

    // ---------------------------------------------------------------
    // AUTHENTICATION INVARIANT REJECTIONS (401 & 403)
    // ---------------------------------------------------------------
    console.log('\n---------------------------------------------------------------');
    console.log('AUTHENTICATION REJECTIONS: Missing (401), Expired (401), Non-SuperAdmin (403)');
    console.log('---------------------------------------------------------------');

    // 1. Missing Token => 401
    try {
      const formNoToken = new FormData();
      formNoToken.append('logo', syntheticLogoBuffer, { filename: 'test.png', contentType: 'image/png' });
      await axios.post(`${baseUrl}/api/superadmin/process-logo`, formNoToken, { headers: formNoToken.getHeaders() });
      results.authRejections.checks.push({ test: 'Missing token returns 401', status: 'FAIL', detail: 'Did not reject' });
    } catch (err) {
      const status = err.response?.status;
      const errorMsg = err.response?.data?.error;
      assert.strictEqual(status, 401, `Expected 401, got ${status}`);
      assert.strictEqual(errorMsg, 'No token provided');
      console.log(`  ✓ Missing token correctly rejected with HTTP 401 ('No token provided')`);
      results.authRejections.checks.push({ test: 'Missing token returns 401', status: 'PASS', code: status, error: errorMsg });
    }

    // 2. Expired Token => 401
    try {
      const formExpired = new FormData();
      formExpired.append('logo', syntheticLogoBuffer, { filename: 'test.png', contentType: 'image/png' });
      await axios.post(`${baseUrl}/api/superadmin/process-logo`, formExpired, {
        headers: { ...formExpired.getHeaders(), 'Authorization': `Bearer ${expiredToken}` }
      });
      results.authRejections.checks.push({ test: 'Expired token returns 401', status: 'FAIL', detail: 'Did not reject' });
    } catch (err) {
      const status = err.response?.status;
      assert.strictEqual(status, 401, `Expected 401, got ${status}`);
      console.log(`  ✓ Expired token correctly rejected with HTTP 401`);
      results.authRejections.checks.push({ test: 'Expired token returns 401', status: 'PASS', code: status });
    }

    // 3. Non-SuperAdmin Token (Doctor) => 403
    try {
      const formDoctor = new FormData();
      formDoctor.append('logo', syntheticLogoBuffer, { filename: 'test.png', contentType: 'image/png' });
      await axios.post(`${baseUrl}/api/superadmin/process-logo`, formDoctor, {
        headers: { ...formDoctor.getHeaders(), 'Authorization': `Bearer ${doctorToken}` }
      });
      results.authRejections.checks.push({ test: 'Non-SuperAdmin token returns 403', status: 'FAIL', detail: 'Did not reject' });
    } catch (err) {
      const status = err.response?.status;
      const errorMsg = err.response?.data?.error;
      assert.strictEqual(status, 403, `Expected 403, got ${status}`);
      assert(errorMsg?.toLowerCase().includes('super admin'), `Expected superadmin access denied, got: ${errorMsg}`);
      console.log(`  ✓ Non-SuperAdmin token (Doctor) correctly rejected with HTTP 403 ('${errorMsg}')`);
      results.authRejections.checks.push({ test: 'Non-SuperAdmin token returns 403', status: 'PASS', code: status, error: errorMsg });
    }

    const allRejectionsPassed = results.authRejections.checks.every(c => c.status === 'PASS');
    results.authRejections.status = allRejectionsPassed ? 'PASS' : 'FAIL';

  } catch (fatalErr) {
    console.error('[FATAL RUNTIME TEST ERROR]', fatalErr);
  } finally {
    // ---------------------------------------------------------------
    // CLEANUP SYNTHETIC OBJECTS & RECORDS
    // ---------------------------------------------------------------
    console.log('\n---------------------------------------------------------------');
    console.log('CLEANUP: Removing Synthetic R2 Objects & Temporary Test Clinic');
    console.log('---------------------------------------------------------------');

    for (const url of uploadedR2Keys) {
      await cleanupR2Object(url);
    }

    if (testHospitalDoc && testHospitalDoc._id) {
      try {
        await SuperAdminHospital.findByIdAndDelete(testHospitalDoc._id);
        console.log(`  [CLEANUP] Deleted temporary test hospital: ${testHospitalDoc._id}`);
      } catch (dbErr) {
        console.warn(`  [CLEANUP WARNING] Failed to delete test hospital doc: ${dbErr.message}`);
      }
    }

    if (serverInstance) {
      serverInstance.close();
      console.log('  [CLEANUP] Local test Express server closed.');
    }

    await mongoose.disconnect();
    console.log('  [CLEANUP] MongoDB disconnected.');
  }

  // Final summary
  console.log('\n======================================================================');
  console.log('  FINAL RUNTIME TEST RESULTS SUMMARY                                  ');
  console.log('======================================================================');
  console.log(`1. Workflow 1 (${results.workflow1.name}): [${results.workflow1.status}] HTTP ${results.workflow1.httpStatus}`);
  console.log(`   Details: ${results.workflow1.details}`);
  console.log(`2. Workflow 2 (${results.workflow2.name}): [${results.workflow2.status}] HTTP ${results.workflow2.httpStatus}`);
  console.log(`   Details: ${results.workflow2.details}`);
  console.log(`3. Workflow 3 (${results.workflow3.name}): [${results.workflow3.status}] HTTP ${results.workflow3.httpStatus}`);
  console.log(`   Details: ${results.workflow3.details}`);
  console.log(`4. Invariants (${results.authRejections.name}): [${results.authRejections.status}]`);
  for (const c of results.authRejections.checks) {
    console.log(`   - ${c.test}: [${c.status}] HTTP ${c.code || ''}`);
  }
  console.log('======================================================================\n');

  const overallPass = results.workflow1.status === 'PASS' &&
                      results.workflow2.status === 'PASS' &&
                      results.workflow3.status === 'PASS' &&
                      results.authRejections.status === 'PASS';

  if (!overallPass) {
    process.exit(1);
  }
}

run();
