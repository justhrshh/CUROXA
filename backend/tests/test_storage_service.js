/**
 * Comprehensive Automated Test Suite: Cloudflare R2 Storage Foundation & Secure Uploads
 * 
 * Verifies:
 * 1. Lazy client initialization
 * 2. Public and private bucket separation
 * 3. Tenant isolation in object keys
 * 4. PII-free keys enforcement
 * 5. MIME type & magic-byte binary signature validation
 * 6. File size limits enforcement
 * 7. Presigned URL generation and expiration parameters
 * 8. Private upload fail-closed behavior (no fallback to public)
 * 9. Missing env vars / unconfigured driver error handling
 * 10. SHA-256 checksum integrity calculation
 * 11. Unauthenticated request: DENY (401)
 * 12. Receptionist accessing another patient's prescription in same hospital: ALLOW
 * 13. Receptionist accessing another hospital's prescription: DENY (403)
 * 14. Doctor accessing another doctor's patient's prescription in same hospital: ALLOW (no treatingDoctorId restriction)
 * 15. Doctor accessing another hospital's prescription: DENY (403)
 * 16. Patient accessing their own prescription: ALLOW (verified via Patient record)
 * 17. Patient accessing another patient's prescription in same hospital: DENY (403)
 * 18. Authorized super administrator accessing another hospital's prescription: ALLOW (cross-tenant permitted)
 * 19. Unauthorized user attempting prescription access: DENY (403)
 */

const assert = require('assert');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// Load environment variables for testing if available
require('dotenv').config();

const { StorageService } = require('../services/storage/storageService');
const { validateFile, detectMimeTypeFromMagicBytes } = require('../services/storage/fileValidator');
const LocalDriver = require('../services/storage/localDriver');
const R2Driver = require('../services/storage/r2Driver');
const r2Config = require('../config/r2');
const secureUploadsMiddleware = require('../middleware/secureUploadsMiddleware');
const Prescription = require('../models/Prescription');
const Patient = require('../models/Patient');

let testsPassed = 0;
let testsTotal = 0;

function runTest(name, fn) {
  testsTotal++;
  try {
    const res = fn();
    if (res && typeof res.then === 'function') {
      return res.then(() => {
        console.log(`  ✓ PASS: ${name}`);
        testsPassed++;
      }).catch(err => {
        console.error(`  ✗ FAIL: ${name}`);
        console.error(`    Error: ${err.message}`);
        throw err;
      });
    }
    console.log(`  ✓ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    Error: ${err.message}`);
    throw err;
  }
}

async function runAllTests() {
  console.log('\n============================================================');
  console.log('--- STORAGE FOUNDATION & SECURE UPLOADS TEST SUITE ---');
  console.log('============================================================\n');

  // Test 1: Lazy client initialization
  await runTest('1. Lazy client initialization does not fail until client is requested without config', () => {
    const origId = process.env.R2_ACCOUNT_ID;
    const origKey = process.env.R2_ACCESS_KEY_ID;
    const origSec = process.env.R2_SECRET_ACCESS_KEY;

    try {
      delete process.env.R2_ACCOUNT_ID;
      delete process.env.R2_ACCESS_KEY_ID;
      delete process.env.R2_SECRET_ACCESS_KEY;
      r2Config.resetR2Client();

      assert.strictEqual(r2Config.isR2Configured(), false, 'Should report unconfigured when env vars are missing');

      assert.throws(() => {
        r2Config.getR2Client();
      }, (err) => {
        return err.code === 'R2_CONFIG_MISSING';
      }, 'Should throw R2_CONFIG_MISSING when getR2Client called without config');
    } finally {
      process.env.R2_ACCOUNT_ID = origId;
      process.env.R2_ACCESS_KEY_ID = origKey;
      process.env.R2_SECRET_ACCESS_KEY = origSec;
      r2Config.resetR2Client();
    }
  });

  // Test 2: Public and private bucket separation
  await runTest('2. Public and private bucket separation', () => {
    const origPub = process.env.R2_BUCKET_PUBLIC;
    const origPriv = process.env.R2_BUCKET_PRIVATE;

    try {
      process.env.R2_BUCKET_PUBLIC = 'test-public-assets';
      process.env.R2_BUCKET_PRIVATE = 'test-private-vault';

      assert.strictEqual(r2Config.getR2PublicBucket(), 'test-public-assets');
      assert.strictEqual(r2Config.getR2PrivateBucket(), 'test-private-vault');
      assert.notStrictEqual(r2Config.getR2PublicBucket(), r2Config.getR2PrivateBucket(), 'Buckets must be strictly separate');
    } finally {
      process.env.R2_BUCKET_PUBLIC = origPub;
      process.env.R2_BUCKET_PRIVATE = origPriv;
    }
  });

  // Test 3: Tenant isolation in object keys
  await runTest('3. Tenant isolation in object keys', () => {
    const service = new StorageService({ driver: 'local' });

    const privateKey = service.generateObjectKey({
      tenantId: 'City_Hospital_South',
      category: 'prescriptions',
      sanitizedExt: '.jpg',
      isPrivate: true
    });
    assert(privateKey.startsWith('tenants/city_hospital_south/prescriptions/'), `Private key must start with tenant path: ${privateKey}`);
    assert(privateKey.endsWith('.jpg'), `Private key must keep extension: ${privateKey}`);

    const publicKey = service.generateObjectKey({
      tenantId: 'Apollo_Clinic',
      category: 'logos',
      sanitizedExt: '.png',
      isPrivate: false
    });
    assert(publicKey.startsWith('public/apollo_clinic/logos/'), `Public key must start with public tenant path: ${publicKey}`);
  });

  // Test 4: PII-free keys enforcement
  await runTest('4. PII-free keys enforcement (scrubbing names, phone numbers, UHIDs)', () => {
    const service = new StorageService({ driver: 'local' });

    const untrustedName = 'Patient_Ramesh_Kumar_UHID99281_Phone9876543210.pdf';
    const validation = validateFile({
      buffer: Buffer.from('%PDF-1.4 test stream'),
      mimetype: 'application/pdf',
      originalName: untrustedName
    });

    const key = service.generateObjectKey({
      tenantId: 'hospital_a',
      category: 'prescriptions',
      sanitizedExt: validation.sanitizedExt,
      isPrivate: true
    });

    assert(!key.includes('Ramesh'), 'Object key must not contain patient name');
    assert(!key.includes('Kumar'), 'Object key must not contain patient surname');
    assert(!key.includes('99281'), 'Object key must not contain UHID');
    assert(!key.includes('9876543210'), 'Object key must not contain phone number');
    assert(key.endsWith('.pdf'), 'Object key must keep sanitized extension');
  });

  // Test 5: MIME type & magic-byte signature validation
  await runTest('5. MIME type and magic-byte signature validation', () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
    const pngRes = validateFile({ buffer: pngBuffer, mimetype: 'image/png' });
    assert.strictEqual(pngRes.detectedMimeType, 'image/png');

    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
    const jpegRes = validateFile({ buffer: jpegBuffer, mimetype: 'image/jpeg' });
    assert.strictEqual(jpegRes.detectedMimeType, 'image/jpeg');

    const pdfBuffer = Buffer.from('%PDF-1.5 test document header');
    const pdfRes = validateFile({ buffer: pdfBuffer, mimetype: 'application/pdf' });
    assert.strictEqual(pdfRes.detectedMimeType, 'application/pdf');

    const webpBuffer = Buffer.concat([
      Buffer.from([0x52, 0x49, 0x46, 0x46]),
      Buffer.from([0x20, 0x00, 0x00, 0x00]),
      Buffer.from([0x57, 0x45, 0x42, 0x50]),
      Buffer.from('VP8 ')
    ]);
    const webpRes = validateFile({ buffer: webpBuffer, mimetype: 'image/webp' });
    assert.strictEqual(webpRes.detectedMimeType, 'image/webp');

    const spoofedBuffer = Buffer.from('NOT A REAL IMAGE');
    assert.throws(() => {
      validateFile({ buffer: spoofedBuffer, mimetype: 'image/png' });
    }, (err) => {
      return err.code === 'INVALID_FILE_SIGNATURE' || err.code === 'MIME_TYPE_MISMATCH';
    }, 'Must reject spoofed file with signature mismatch');

    assert.throws(() => {
      validateFile({ buffer: pngBuffer, mimetype: 'application/x-dosexec' });
    }, (err) => {
      return err.code === 'MIME_TYPE_DISALLOWED';
    }, 'Must reject disallowed executable MIME type');
  });

  // Test 6: File size limits enforcement
  await runTest('6. File size limits enforcement', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const padding = Buffer.alloc(200);
    const oversizedBuffer = Buffer.concat([pngHeader, padding]);

    assert.throws(() => {
      validateFile({
        buffer: oversizedBuffer,
        mimetype: 'image/png',
        maxSize: 100
      });
    }, (err) => {
      return err.code === 'FILE_TOO_LARGE';
    }, 'Must reject file exceeding maximum size limit');
  });

  // Test 7: Presigned URL expiration
  await runTest('7. Presigned URL generation and expiration parameters', async () => {
    const service = new StorageService({ driver: 'local' });
    const dummyBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);

    const upload = await service.uploadPrivate({
      tenantId: 'test_tenant',
      category: 'prescriptions',
      buffer: dummyBuffer,
      mimetype: 'image/png'
    });

    const downloadUrl = await service.createPresignedDownloadUrl({
      key: upload.key,
      isPrivate: true,
      expiresInSeconds: 300
    });

    assert(downloadUrl.includes('expires='), 'URL must contain expiration timestamp');
    assert(downloadUrl.includes('signature='), 'URL must contain cryptographic signature');

    await service.deleteObject({ key: upload.key, isPrivate: true });
  });

  // Test 8: Private upload fail-closed behavior
  await runTest('8. Private upload fail-closed behavior (no fallback to public)', async () => {
    const mockR2Driver = {
      uploadPrivate: async () => {
        throw new Error('Connection to private vault timed out');
      },
      uploadPublic: async () => {
        throw new Error('FATAL: uploadPublic was called during private upload!');
      }
    };

    const service = new StorageService({
      driver: 'r2',
      r2Driver: mockR2Driver
    });

    const dummyBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);

    await assert.rejects(async () => {
      await service.uploadPrivate({
        tenantId: 'tenant_fail',
        category: 'prescriptions',
        buffer: dummyBuffer,
        mimetype: 'image/png'
      });
    }, (err) => {
      return err.code === 'PRIVATE_STORAGE_ERROR' || err.message.includes('failed securely');
    }, 'Must fail-closed and throw PRIVATE_STORAGE_ERROR');
  });

  // Test 9: Missing env vars / unconfigured driver handling
  await runTest('9. Missing env vars and unconfigured driver handling', () => {
    const origId = process.env.R2_ACCOUNT_ID;
    try {
      delete process.env.R2_ACCOUNT_ID;
      r2Config.resetR2Client();

      assert.strictEqual(r2Config.isR2Configured(), false);
      assert.throws(() => {
        r2Config.getR2Client();
      }, err => err.code === 'R2_CONFIG_MISSING');
    } finally {
      process.env.R2_ACCOUNT_ID = origId;
      r2Config.resetR2Client();
    }
  });

  // Test 10: SHA-256 checksum generation
  await runTest('10. SHA-256 checksum integrity calculation', async () => {
    const service = new StorageService({ driver: 'local' });
    const content = 'QUROXA_CLINICAL_INTEGRITY_VERIFICATION';
    const buffer = Buffer.from(content, 'utf8');

    const expectedHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const calculated = service.calculateChecksum(buffer);

    assert.strictEqual(calculated, expectedHash, 'Calculated checksum must match crypto SHA-256');

    const pngBuffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
      buffer
    ]);
    const upload = await service.uploadPublic({
      tenantId: 'test_tenant',
      category: 'branding',
      buffer: pngBuffer,
      mimetype: 'image/png'
    });

    assert.strictEqual(upload.checksum, crypto.createHash('sha256').update(pngBuffer).digest('hex'));

    await service.deleteObject({ key: upload.key, isPrivate: false });
  });

  // --------------------------------------------------------------------------
  // PERMISSION & SECURITY SUITE (EXPLICIT BUSINESS RULES)
  // --------------------------------------------------------------------------

  // Set up mock physical file for tests 11-19
  const prescriptionsDir = path.resolve(__dirname, '../uploads/prescriptions');
  if (!fs.existsSync(prescriptionsDir)) fs.mkdirSync(prescriptionsDir, { recursive: true });
  const testFileName = 'rx-test-access-verification.jpg';
  const testFilePath = path.resolve(prescriptionsDir, testFileName);
  fs.writeFileSync(testFilePath, 'dummy-prescription-data-payload');

  const origPrescriptionFindOne = Prescription.findOne;
  const origPatientFindById = Patient.findById;

  const samplePrescriptionDoc = {
    tenantId: 'hospital_city',
    patientId: 'patient_alpha_111',
    doctorId: 'doctor_smith_222', // Created by Dr. Smith
    images: [{ url: `/uploads/prescriptions/${testFileName}` }]
  };

  const samplePatientDoc = {
    _id: 'patient_alpha_111',
    name: 'Ramesh Kumar',
    contact: '9876543210',
    email: 'ramesh@example.com',
    tenantId: 'hospital_city'
  };

  // Helper response builder
  function createMockResponse() {
    let statusCode = 200;
    let jsonBody = null;
    let fileServed = null;

    const res = {
      status: (code) => {
        statusCode = code;
        return res;
      },
      json: (data) => {
        jsonBody = data;
        return res;
      },
      setHeader: () => {},
      sendFile: (filePath) => {
        fileServed = filePath;
        return res;
      },
      getStatusCode: () => statusCode,
      getJson: () => jsonBody,
      getFile: () => fileServed
    };
    return res;
  }

  try {
    Prescription.findOne = () => ({
      select: () => Promise.resolve(samplePrescriptionDoc)
    });

    Patient.findById = (id) => ({
      select: () => Promise.resolve(
        id.toString() === samplePatientDoc._id ? samplePatientDoc : null
      )
    });

    // Test 11: Unauthenticated request rejected (401)
    await runTest('11. Unauthenticated request: DENY (401)', async () => {
      const req = {
        path: `/prescriptions/${testFileName}`,
        headers: {},
        cookies: {}
      };
      const res = createMockResponse();

      await secureUploadsMiddleware(req, res, () => {});

      assert.strictEqual(res.getStatusCode(), 401, 'Unauthenticated access must return 401');
      assert.strictEqual(res.getJson().code, 'UNAUTHORIZED');
    });

    // Test 12: Receptionist accessing another patient's prescription in same hospital: ALLOW
    await runTest("12. Receptionist accessing another patient's prescription in the same hospital: ALLOW", async () => {
      const receptionistToken = jwt.sign(
        { id: 'recep_999', role: 'receptionist', tenantId: 'hospital_city' },
        process.env.JWT_SECRET || 'secret_key'
      );
      const req = {
        path: `/prescriptions/${testFileName}`,
        headers: { authorization: `Bearer ${receptionistToken}` },
        cookies: {}
      };
      const res = createMockResponse();

      await secureUploadsMiddleware(req, res, () => {});

      assert.strictEqual(res.getFile(), testFilePath, "Receptionist in same hospital must be allowed to access patient's prescription");
    });

    // Test 13: Receptionist accessing another hospital's prescription: DENY (403)
    await runTest("13. Receptionist accessing another hospital's prescription: DENY (403)", async () => {
      const otherRecepToken = jwt.sign(
        { id: 'recep_other_888', role: 'receptionist', tenantId: 'hospital_metro' },
        process.env.JWT_SECRET || 'secret_key'
      );
      const req = {
        path: `/prescriptions/${testFileName}`,
        headers: { authorization: `Bearer ${otherRecepToken}` },
        cookies: {}
      };
      const res = createMockResponse();

      await secureUploadsMiddleware(req, res, () => {});

      assert.strictEqual(res.getStatusCode(), 403, 'Cross-tenant receptionist access must return 403');
      assert.strictEqual(res.getJson().code, 'FORBIDDEN_TENANT_MISMATCH');
    });

    // Test 14: Doctor accessing another doctor's patient's prescription in same hospital: ALLOW
    await runTest("14. Doctor accessing another doctor's patient's prescription in the same hospital: ALLOW", async () => {
      // Dr. Jones (not Dr. Smith who authored the prescription) in hospital_city
      const doctorJonesToken = jwt.sign(
        { id: 'doctor_jones_333', role: 'doctor', tenantId: 'hospital_city' },
        process.env.JWT_SECRET || 'secret_key'
      );
      const req = {
        path: `/prescriptions/${testFileName}`,
        headers: { authorization: `Bearer ${doctorJonesToken}` },
        cookies: {}
      };
      const res = createMockResponse();

      await secureUploadsMiddleware(req, res, () => {});

      assert.strictEqual(res.getFile(), testFilePath, 'Doctor in same hospital must have access regardless of assigned treating doctor');
    });

    // Test 15: Doctor accessing another hospital's prescription: DENY (403)
    await runTest("15. Doctor accessing another hospital's prescription: DENY (403)", async () => {
      const otherDoctorToken = jwt.sign(
        { id: 'doctor_metro_444', role: 'doctor', tenantId: 'hospital_metro' },
        process.env.JWT_SECRET || 'secret_key'
      );
      const req = {
        path: `/prescriptions/${testFileName}`,
        headers: { authorization: `Bearer ${otherDoctorToken}` },
        cookies: {}
      };
      const res = createMockResponse();

      await secureUploadsMiddleware(req, res, () => {});

      assert.strictEqual(res.getStatusCode(), 403, 'Cross-tenant doctor access must return 403');
      assert.strictEqual(res.getJson().code, 'FORBIDDEN_TENANT_MISMATCH');
    });

    // Test 16: Patient accessing their own prescription: ALLOW
    await runTest('16. Patient accessing their own prescription: ALLOW', async () => {
      // Patient Alpha token with matching contact number and ID
      const patientAlphaToken = jwt.sign(
        { id: 'patient_alpha_111', role: 'patient', phone: '9876543210', tenantId: 'hospital_city' },
        process.env.JWT_SECRET || 'secret_key'
      );
      const req = {
        path: `/prescriptions/${testFileName}`,
        headers: { authorization: `Bearer ${patientAlphaToken}` },
        cookies: {}
      };
      const res = createMockResponse();

      await secureUploadsMiddleware(req, res, () => {});

      assert.strictEqual(res.getFile(), testFilePath, 'Patient owner must receive their own prescription file');
    });

    // Test 17: Patient accessing another patient's prescription: DENY (403)
    await runTest("17. Patient accessing another patient's prescription (same hospital): DENY (403)", async () => {
      // Patient Beta in the SAME hospital hospital_city
      const patientBetaToken = jwt.sign(
        { id: 'patient_beta_555', role: 'patient', phone: '9123456789', tenantId: 'hospital_city' },
        process.env.JWT_SECRET || 'secret_key'
      );
      const req = {
        path: `/prescriptions/${testFileName}`,
        headers: { authorization: `Bearer ${patientBetaToken}` },
        cookies: {}
      };
      const res = createMockResponse();

      await secureUploadsMiddleware(req, res, () => {});

      assert.strictEqual(res.getStatusCode(), 403, "Patient cannot access another patient's prescription in same hospital");
      assert.strictEqual(res.getJson().code, 'FORBIDDEN_NOT_OWNER');
    });

    // Test 18: Authorized super administrator accessing another hospital's prescription: ALLOW
    await runTest("18. Authorized super administrator accessing another hospital's prescription: ALLOW", async () => {
      // Superadmin token from curoxa platform tenant
      const superAdminToken = jwt.sign(
        { id: 'super_admin_001', role: 'superadmin', tenantId: 'curoxa' },
        process.env.JWT_SECRET || 'secret_key'
      );
      const req = {
        path: `/prescriptions/${testFileName}`,
        headers: { authorization: `Bearer ${superAdminToken}` },
        cookies: {}
      };
      const res = createMockResponse();

      await secureUploadsMiddleware(req, res, () => {});

      assert.strictEqual(res.getFile(), testFilePath, 'Authorized super administrator must be allowed cross-tenant prescription access');
    });

    // Test 19: Unauthorized user attempting prescription access: DENY (403)
    await runTest('19. Unauthorized user attempting prescription access: DENY (403)', async () => {
      const unauthorizedGuestToken = jwt.sign(
        { id: 'guest_user_777', role: 'guest', tenantId: 'hospital_city' },
        process.env.JWT_SECRET || 'secret_key'
      );
      const req = {
        path: `/prescriptions/${testFileName}`,
        headers: { authorization: `Bearer ${unauthorizedGuestToken}` },
        cookies: {}
      };
      const res = createMockResponse();

      await secureUploadsMiddleware(req, res, () => {});

      assert.strictEqual(res.getStatusCode(), 403, 'Unauthorized role must be denied with 403');
      assert.strictEqual(res.getJson().code, 'FORBIDDEN');
    });

  } finally {
    Prescription.findOne = origPrescriptionFindOne;
    Patient.findById = origPatientFindById;
    if (fs.existsSync(testFilePath)) fs.unlinkSync(testFilePath);
  }

  console.log('\n============================================================');
  console.log(`SUMMARY: ${testsPassed} of ${testsTotal} test suites passed.`);
  console.log('============================================================\n');

  if (testsPassed === testsTotal) {
    console.log('All storage service foundation and permission tests PASSED successfully.');
    process.exit(0);
  } else {
    console.error('Some tests FAILED.');
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
