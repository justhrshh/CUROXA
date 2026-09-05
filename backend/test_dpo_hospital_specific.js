const mongoose = require('mongoose');
const assert = require('assert');
const jwt = require('jsonwebtoken');
const http = require('http');
const express = require('express');

const Patient = require('./models/Patient');
const PatientIdentity = require('./models/PatientIdentity');
const Visit = require('./models/Visit');
const Appointment = require('./models/Appointment');
const SuperAdminHospital = require('./models/SuperAdminHospital');
const DpoConsentRequest = require('./models/DpoConsentRequest');
const dpoRoutes = require('./routes/dpoRoutes');
const { getJwtSecret } = require('./config/env');
const {
  resolveOrCreateUhid,
  generateHospitalPatientId,
  generateVisitId
} = require('./utils/identifierEngine');

process.env.JWT_SECRET = 'curoxa_super_secret_jwt_key_2026_dpo';
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://curoxa:medicore@medicore.emltj84.mongodb.net/?appName=medicore';

const app = express();
app.use(express.json());
app.use('/api/dpo', dpoRoutes);

let passed = 0;
function pass(testNum, testName) {
  passed++;
  console.log(`[PASS ✓] Test ${testNum}: ${testName}`);
}

async function runHospitalSpecificDpoTests() {
  console.log('========================================================================');
  console.log('   CUROXA — DPO HOSPITAL-SPECIFIC REFINEMENT VERIFICATION SUITE');
  console.log('========================================================================\n');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.\n');

  // Start temporary HTTP server on random port
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api/dpo`;

  const TENANT_A = 'test_hosp_spec_a';
  const TENANT_B = 'test_hosp_spec_b';
  const TENANT_C = 'test_hosp_spec_c';

  await SuperAdminHospital.findOneAndUpdate(
    { code: TENANT_A },
    { $set: { name: 'Apollo Specialized Hospital', hospitalId: 'HSP-APOLLO', code: TENANT_A, status: 'Active' } },
    { upsert: true }
  );
  await SuperAdminHospital.findOneAndUpdate(
    { code: TENANT_B },
    { $set: { name: 'Fortis Healthcare Center', hospitalId: 'HSP-FORTIS', code: TENANT_B, status: 'Active' } },
    { upsert: true }
  );
  await SuperAdminHospital.findOneAndUpdate(
    { code: TENANT_C },
    { $set: { name: 'City Care Hospital', hospitalId: 'HSP-CITYCARE', code: TENANT_C, status: 'Active' } },
    { upsert: true }
  );

  await DpoConsentRequest.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B, TENANT_C] } });

  const testPhone = `91${Math.floor(10000000 + Math.random() * 90000000)}`;
  const uhId = await resolveOrCreateUhid({ contact: testPhone, name: 'Ananya Sharma' });

  const patIdA = await generateHospitalPatientId(TENANT_A);
  const patientA = await Patient.create({
    tenantId: TENANT_A,
    uhId,
    patientId: patIdA,
    name: 'Ananya Sharma',
    contact: testPhone,
    gender: 'Female',
    age: 29
  });

  const patIdB = await generateHospitalPatientId(TENANT_B);
  const patientB = await Patient.create({
    tenantId: TENANT_B,
    uhId,
    patientId: patIdB,
    name: 'Ananya Sharma',
    contact: testPhone,
    gender: 'Female',
    age: 29
  });

  const secret = getJwtSecret();
  const patientToken = jwt.sign(
    {
      id: patientA._id.toString(),
      uhId,
      phone: testPhone,
      contact: testPhone,
      name: 'Ananya Sharma',
      role: 'patient'
    },
    secret,
    { expiresIn: '2h' }
  );

  // Test 1: Missing hospitalId rejects with 400
  const res1 = await fetch(`${baseUrl}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ categories: { personal: true }, termsAcknowledged: true })
  });
  const data1 = await res1.json();
  assert.strictEqual(res1.status, 400);
  assert(data1.error.toLowerCase().includes('hospital'));
  pass(1, 'Backend rejects withdrawal request with missing hospitalId (HTTP 400)');

  // Test 2: Missing hospitalId on /withdraw alias also rejects with 400
  const res2 = await fetch(`${baseUrl}/withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ categories: { personal: true }, termsAcknowledged: true })
  });
  assert.strictEqual(res2.status, 400);
  pass(2, 'POST /api/dpo/withdraw alias also rejects missing hospitalId (HTTP 400)');

  // Test 3: Non-existent hospital returns 404
  const res3 = await fetch(`${baseUrl}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ hospitalId: 'non_existent_hospital_9999', categories: { personal: true }, termsAcknowledged: true })
  });
  assert.strictEqual(res3.status, 404);
  pass(3, 'Backend rejects non-existent hospitalId (HTTP 404)');

  // Test 4: Arbitrary Hospital C where patient has NO relationship returns 403
  const res4 = await fetch(`${baseUrl}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ hospitalId: TENANT_C, categories: { personal: true }, termsAcknowledged: true })
  });
  const data4 = await res4.json();
  assert.strictEqual(res4.status, 403);
  assert(data4.error.toLowerCase().includes('access denied'));
  pass(4, 'Backend strictly rejects withdrawal for unlinked hospital where patient has no records (HTTP 403)');

  // Test 5: Valid request for Hospital A succeeds and records Hospital A context
  const res5 = await fetch(`${baseUrl}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ hospitalId: TENANT_A, categories: { personal: true, clinical: true }, termsAcknowledged: true })
  });
  const data5 = await res5.json();
  assert.strictEqual(res5.status, 201);
  assert.strictEqual(data5.request.tenantId, TENANT_A);
  assert.strictEqual(data5.request.hospitalPatientId, patIdA);
  assert.strictEqual(data5.request.uhId, uhId);
  pass(5, 'Valid request for Hospital A succeeds with Hospital A tenant and patient ID (HTTP 201)');

  // Test 6: Duplicate active request for Hospital A is blocked
  const res6 = await fetch(`${baseUrl}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ hospitalId: TENANT_A, categories: { personal: true }, termsAcknowledged: true })
  });
  const data6 = await res6.json();
  assert.strictEqual(res6.status, 400);
  assert(data6.error.toLowerCase().includes('active consent withdrawal request'));
  pass(6, 'Duplicate active withdrawal request for Hospital A is blocked (HTTP 400)');

  // Test 7: Switching to Hospital B allows independent Hospital B request
  const res7 = await fetch(`${baseUrl}/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patientToken}` },
    body: JSON.stringify({ hospitalId: TENANT_B, categories: { clinical: true, payment: true }, termsAcknowledged: true })
  });
  const data7 = await res7.json();
  assert.strictEqual(res7.status, 201);
  assert.strictEqual(data7.request.tenantId, TENANT_B);
  assert.strictEqual(data7.request.hospitalPatientId, patIdB);
  assert.notStrictEqual(data7.request.hospitalPatientId, patIdA);
  pass(7, 'Switching to Hospital B creates independent request with Hospital B tenant and patient ID');

  // Test 8: Hospital query filtering on GET /patient/my-requests
  const res8A = await fetch(`${baseUrl}/patient/my-requests?hospitalId=${TENANT_A}`, {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  const data8A = await res8A.json();
  assert.strictEqual(res8A.status, 200);
  assert.strictEqual(data8A.length, 1);
  assert.strictEqual(data8A[0].tenantId, TENANT_A);

  const res8B = await fetch(`${baseUrl}/patient/my-requests?hospitalId=${TENANT_B}`, {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  const data8B = await res8B.json();
  assert.strictEqual(res8B.status, 200);
  assert.strictEqual(data8B.length, 1);
  assert.strictEqual(data8B[0].tenantId, TENANT_B);

  const res8C = await fetch(`${baseUrl}/patient/my-requests?hospitalId=${TENANT_C}`, {
    headers: { Authorization: `Bearer ${patientToken}` }
  });
  const data8C = await res8C.json();
  assert.strictEqual(res8C.status, 200);
  assert.strictEqual(data8C.length, 0);
  pass(8, 'GET /patient/my-requests correctly filters by active hospital context');

  console.log('\n========================================================================');
  console.log(`   ALL ${passed} / 8 HOSPITAL-SPECIFIC REFINEMENT CHECKS PASSED (100%)`);
  console.log('========================================================================\n');

  await DpoConsentRequest.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B, TENANT_C] } });
  await Patient.deleteMany({ _id: { $in: [patientA._id, patientB._id] } });
  await PatientIdentity.deleteMany({ contact: testPhone });
  await SuperAdminHospital.deleteMany({ code: { $in: [TENANT_A, TENANT_B, TENANT_C] } });

  server.close();
  await mongoose.disconnect();
}

runHospitalSpecificDpoTests().catch(err => {
  console.error('\n[TEST FAILURE ✗]:', err);
  process.exit(1);
});
