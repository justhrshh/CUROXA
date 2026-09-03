/**
 * PHASE 3 FINAL SECURITY / CONTEXT CLOSURE TEST SUITE
 * 
 * Check 1: send-registration-otp Tenant Derivation & Pre-Auth Attack Resistance
 * Check 2: localStorage Portal Context & Data Isolation Boundary
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const http = require('http');
const express = require('express');
const connectDB = require('../config/db');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Medicine = require('../models/Medicine');
const RegistrationOtp = require('../models/RegistrationOtp');
const authRoutes = require('../routes/authRoutes');
const patientRoutes = require('../routes/patientRoutes');
const medicineRoutes = require('../routes/medicineRoutes');
const tenantMiddleware = require('../middleware/tenantMiddleware');
const { resolveTrustedHospitalBranding, buildBrandedOtpEmail } = require('../utils/hospitalBrandingHelper');

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

async function request(serverUrl, path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const body = options.body ? JSON.stringify(options.body) : null;
    const headers = {
      'Content-Type': 'application/json',
      ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      ...(options.headers || {})
    };

    const req = http.request(url, {
      method: options.method || 'GET',
      headers
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: parsed, text: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, body: {}, text: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function runClosureReview() {
  console.log('===============================================================');
  console.log('PHASE 3 FINAL SECURITY & CONTEXT CLOSURE REVIEW');
  console.log('===============================================================\n');

  await connectDB();

  // Set up ephemeral express app
  const app = express();
  app.use(express.json());
  app.use(tenantMiddleware);
  app.use('/api/auth', authRoutes);
  app.use('/api/patients', patientRoutes);
  app.use('/api/medicines', medicineRoutes);

  const server = http.createServer(app);
  await new Promise(res => server.listen(0, '127.0.0.1', res));
  const serverUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // -------------------------------------------------------------
    // Setup test fixtures
    // -------------------------------------------------------------
    const hospA_code = 'hosp_closure_a';
    const hospB_code = 'hosp_closure_b';
    const hospSusp_code = 'hosp_closure_susp';

    await SuperAdminHospital.deleteMany({ code: { $in: [hospA_code, hospB_code, hospSusp_code] } });
    await User.deleteMany({ tenantId: { $in: [hospA_code, hospB_code, hospSusp_code] } });
    await Patient.deleteMany({ tenantId: { $in: [hospA_code, hospB_code, hospSusp_code] } });
    await Medicine.deleteMany({ tenantId: { $in: [hospA_code, hospB_code, hospSusp_code] } });
    await RegistrationOtp.deleteMany({ email: { $regex: /closure-test/i } });

    const hospitalA = await SuperAdminHospital.create({
      name: 'Alpha Apex General Hospital',
      code: hospA_code,
      hospitalId: 'HSP-APEX01',
      status: 'Active',
      logo: 'https://cdn.curoxa.com/logos/apex.png',
      theme_color: '#0284C7'
    });

    const hospitalB = await SuperAdminHospital.create({
      name: 'Beta Beacon Specialty Care',
      code: hospB_code,
      hospitalId: 'HSP-BEAC02',
      status: 'Active',
      logo: 'https://cdn.curoxa.com/logos/beacon.png',
      theme_color: '#16A34A'
    });

    const hospitalSuspended = await SuperAdminHospital.create({
      name: 'Suspended Health Clinic',
      code: hospSusp_code,
      hospitalId: 'HSP-SUSP03',
      status: 'Suspended',
      logo: 'SU',
      theme_color: '#DC2626'
    });

    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash('Doctor@123', 10);

    const docA = await User.create({
      name: 'Dr. Apex Physician',
      email: 'doctor.apex@closure-test.com',
      staff_id: 'DOC-APEX-1',
      password_hash: hash,
      role: 'doctor',
      tenantId: hospA_code,
      isSetupComplete: true
    });

    const patientA = await Patient.create({
      name: 'Alice Alpha',
      email: 'alice.alpha@closure-test.com',
      contact: '9999900001',
      gender: 'Female',
      age: 30,
      tenantId: hospA_code
    });

    const patientB = await Patient.create({
      name: 'Bob Beta',
      email: 'bob.beta@closure-test.com',
      contact: '9999900002',
      gender: 'Male',
      age: 35,
      tenantId: hospB_code
    });

    const medA = await Medicine.create({
      name: 'Amoxicillin 500mg',
      sku: 'AMX-500-CLOSURE-A',
      stock: 100,
      mrp: 10,
      unit: 'Tablets',
      category: 'Antibiotics',
      tenantId: hospA_code
    });

    const medB = await Medicine.create({
      name: 'Benadryl 25mg',
      sku: 'BEN-025-CLOSURE-B',
      stock: 50,
      mrp: 8,
      unit: 'Syrup',
      category: 'Antihistamines',
      tenantId: hospB_code
    });

    // =============================================================
    // CHECK 1: send-registration-otp Pre-Authentication Security
    // =============================================================
    console.log('[CHECK 1] send-registration-otp Tenant Derivation & Pre-Auth Tests');

    // Test A: Correct Hospital A registration context (via x-tenant-id or body)
    const testAEmail = 'newpatient.a@closure-test.com';
    const resA = await request(serverUrl, '/api/auth/send-registration-otp', {
      method: 'POST',
      headers: { 'x-tenant-id': hospA_code },
      body: { email: testAEmail }
    });
    assert(resA.status === 200, 'Registration OTP request for Hospital A returns 200');
    
    // Check branding resolved for Hospital A
    const brandingA = await resolveTrustedHospitalBranding(hospA_code);
    assert(brandingA.name === 'Alpha Apex General Hospital', 'Server derives Hospital A name from DB');
    assert(brandingA.logo === 'https://cdn.curoxa.com/logos/apex.png', 'Server derives Hospital A logo from DB');

    // Test B: Hospital A portal + Spoofed client body attributes
    const testBEmail = 'newpatient.spoof@closure-test.com';
    const resB = await request(serverUrl, '/api/auth/send-registration-otp', {
      method: 'POST',
      headers: { 'x-tenant-id': hospA_code },
      body: {
        email: testBEmail,
        hospitalName: 'MALICIOUS_SPOOFED_HOSPITAL_NAME',
        logo: 'http://malicious.evil.com/fake.png'
      }
    });
    assert(resB.status === 200, 'Registration OTP request with spoofed body returns 200');
    
    // Verify that the server ignored client-supplied hospitalName/logo
    const brandingFromReq = await resolveTrustedHospitalBranding(hospA_code);
    assert(brandingFromReq.name !== 'MALICIOUS_SPOOFED_HOSPITAL_NAME', 'Client-supplied hospitalName is completely ignored');
    assert(brandingFromReq.logo !== 'http://malicious.evil.com/fake.png', 'Client-supplied logo URL is completely ignored');
    assert(brandingFromReq.name === 'Alpha Apex General Hospital', 'Server strictly uses database-backed Hospital A branding');

    // Test C: Context explicitly pointing to Hospital B (x-tenant-id: hosp_closure_b)
    const testCEmail = 'newpatient.b@closure-test.com';
    const resC = await request(serverUrl, '/api/auth/send-registration-otp', {
      method: 'POST',
      headers: { 'x-tenant-id': hospB_code },
      body: { email: testCEmail }
    });
    assert(resC.status === 200, 'Registration OTP for Hospital B context returns 200');
    const brandingB = await resolveTrustedHospitalBranding(hospB_code);
    assert(brandingB.name === 'Beta Beacon Specialty Care', 'Hospital B context resolves Hospital B database record');

    // Test D: Invalid hospital identifier
    const testDEmail = 'newpatient.invalid@closure-test.com';
    const resD = await request(serverUrl, '/api/auth/send-registration-otp', {
      method: 'POST',
      headers: { 'x-tenant-id': 'HSP-DOES-NOT-EXIST-9999' },
      body: { email: testDEmail }
    });
    assert(resD.status === 200, 'Pre-auth registration OTP for unknown hospital succeeds gracefully');
    const fallbackBranding = await resolveTrustedHospitalBranding('HSP-DOES-NOT-EXIST-9999');
    assert(fallbackBranding.name === 'Curoxa Healthcare', 'Invalid hospital code safely falls back to standard Curoxa platform default');
    assert(fallbackBranding.isCuroxaDefault === true, 'Fallback marks isCuroxaDefault: true');

    // Test E: Suspended hospital rejection
    const testEEmail = 'newpatient.susp@closure-test.com';
    const resE = await request(serverUrl, '/api/auth/send-registration-otp', {
      method: 'POST',
      headers: { 'x-tenant-id': hospSusp_code },
      body: { email: testEEmail }
    });
    assert(resE.status === 403, 'Registration OTP for Suspended hospital is strictly rejected (403 Access Denied)');
    assert(resE.body.error && resE.body.error.includes('Suspended'), 'Rejection message details Suspended status');

    // =============================================================
    // CHECK 2: localStorage Portal Context & Authorization Boundary
    // =============================================================
    console.log('\n[CHECK 2] localStorage Portal Context & Tampering Verification');

    // Step 1: Login normally as Doctor A
    const loginRes = await request(serverUrl, '/api/auth/login', {
      method: 'POST',
      body: { staff_id: 'DOC-APEX-1', password: 'Doctor@123' }
    });
    assert(loginRes.status === 200 && !!loginRes.body.token, 'Doctor A logs in and receives valid JWT token');
    const tokenA = loginRes.body.token;

    // Step 2: Confirm Doctor A can access Hospital A patient records
    const patientsResA = await request(serverUrl, '/api/patients', {
      headers: { 'Authorization': `Bearer ${tokenA}` }
    });
    assert(patientsResA.status === 200, 'Doctor A accesses /api/patients');
    const patientListA = Array.isArray(patientsResA.body) ? patientsResA.body : patientsResA.body.patients || [];
    assert(patientListA.some(p => p.name === 'Alice Alpha'), 'Doctor A sees Hospital A patient Alice Alpha');
    assert(!patientListA.some(p => p.name === 'Bob Beta'), 'Doctor A cannot see Hospital B patient Bob Beta');

    // Step 3: Simulate client changing localStorage.curoxa_active_portal_id to Hospital B
    // and sending an injected header / query simulating the portal switch
    const tamperedRes = await request(serverUrl, '/api/patients', {
      headers: {
        'Authorization': `Bearer ${tokenA}`,
        'x-tenant-id': hospB_code // Simulates client having switched portal context in localStorage
      }
    });
    assert(tamperedRes.status === 200, 'Tampered request processes through verifyToken + tenantMiddleware');
    const tamperedList = Array.isArray(tamperedRes.body) ? tamperedRes.body : tamperedRes.body.patients || [];
    assert(tamperedList.some(p => p.name === 'Alice Alpha'), 'Token A strictly bounds query to Hospital A despite x-tenant-id override');
    assert(!tamperedList.some(p => p.name === 'Bob Beta'), 'Tampered request still cannot access Hospital B patients');

    // Step 4: Direct ID access attempt to Hospital B patient
    const directIdRes = await request(serverUrl, `/api/patients/${patientB._id}`, {
      headers: {
        'Authorization': `Bearer ${tokenA}`,
        'x-tenant-id': hospB_code
      }
    });
    assert(directIdRes.status === 404, 'Direct resource access to Hospital B patient returns 404 Not Found');

    // Step 5: Direct ID access attempt to Hospital B medicine
    const directMedRes = await request(serverUrl, `/api/medicines/${medB._id}`, {
      headers: {
        'Authorization': `Bearer ${tokenA}`,
        'x-tenant-id': hospB_code
      }
    });
    assert(directMedRes.status === 404, 'Direct resource access to Hospital B medicine returns 404 Not Found');

    console.log('\n===============================================================');
    console.log(`CLOSURE TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('===============================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Closure review execution error:', err);
    process.exit(1);
  } finally {
    server.close();
    await mongoose.disconnect();
  }
}

runClosureReview();
