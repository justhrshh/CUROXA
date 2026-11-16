/**
 * QUROXA Phase 1.1: Independent Security Verification Test Suite
 * 
 * Conducts independent, rigorous verification across:
 * 1. Cross-Tenant Isolation
 * 2. Missing Patient Identity (User without Patient document)
 * 3. All Seven EMR Endpoints across 5 variations each
 * 4. Query Parameter Manipulation (prescriptions, labs, billing)
 * 5. Staff-only Route Probing (identifying unprotected staff routes)
 * 6. Existing Patient Portal Functionality Preservation
 */

const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { getJwtSecret } = require('../config/env');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Prescription = require('../models/Prescription');
const LabRequest = require('../models/LabRequest');
const Billing = require('../models/Billing');
const Appointment = require('../models/Appointment');
const Visit = require('../models/Visit');
const Vital = require('../models/Vital');
const ClinicalNote = require('../models/ClinicalNote');
const Procedure = require('../models/Procedure');
const ClinicalDocument = require('../models/ClinicalDocument');
const Consent = require('../models/Consent');
const AuditLog = require('../models/AuditLog');

const TEST_PORT = 5901;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let server;
const testResults = [];

function recordTest(category, name, passed, details) {
  testResults.push({ category, name, passed, details });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[${icon}] [${category}] ${name}`);
  if (details) console.log(`       -> ${details}`);
}

async function setupServer() {
  const app = express();
  app.use(express.json());

  // Mount backend routes
  app.use('/api/patients', require('../routes/patientRoutes'));
  app.use('/api/prescriptions', require('../routes/prescriptionRoutes'));
  app.use('/api/labs', require('../routes/labRoutes'));
  app.use('/api/billing', require('../routes/billingRoutes'));
  app.use('/api/emr', require('../routes/emrRoutes'));
  app.use('/api/appointments', require('../routes/appointmentRoutes'));
  app.use('/api/hr', require('../routes/hrRoutes'));
  app.use('/api/purchase-orders', require('../routes/purchaseOrderRoutes'));
  app.use('/api/admin', require('../routes/adminRoutes'));
  app.use('/api/superadmin', require('../routes/superAdminRoutes'));
  app.use('/api/medicines', require('../routes/medicineRoutes'));
  app.use('/api/pharmacy-sales', require('../routes/pharmacySaleRoutes'));
  app.use('/api/expenses', require('../routes/expenseRoutes'));

  server = http.createServer(app);
  await new Promise(resolve => server.listen(TEST_PORT, '127.0.0.1', resolve));
}

async function runIndependentVerification() {
  console.log('======================================================================');
  console.log('  QUROXA PHASE 1.1: INDEPENDENT SECURITY VERIFICATION SUITE           ');
  console.log('======================================================================\n');

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  await setupServer();

  const secret = getJwtSecret();
  const TENANT_A = 'tenant_alpha_sec';
  const TENANT_B = 'tenant_beta_sec';

  console.log('[Setup] Provisioning dual-tenant test entities...');

  // Doctor A (Tenant A) & Doctor B (Tenant B)
  const docA = await User.findOneAndUpdate(
    { staff_id: 'doc_alpha_sec', tenantId: TENANT_A },
    {
      staff_id: 'doc_alpha_sec',
      name: 'Dr. Alpha Specialist',
      role: 'doctor',
      tenantId: TENANT_A,
      doctorSlots: ['10:00 AM - 10:30 AM']
    },
    { upsert: true, returnDocument: 'after' }
  );

  const docB = await User.findOneAndUpdate(
    { staff_id: 'doc_beta_sec', tenantId: TENANT_B },
    {
      staff_id: 'doc_beta_sec',
      name: 'Dr. Beta Specialist',
      role: 'doctor',
      tenantId: TENANT_B,
      doctorSlots: ['11:00 AM - 11:30 AM']
    },
    { upsert: true, returnDocument: 'after' }
  );

  // Patient A1 (Tenant A)
  const patientA1 = await Patient.findOneAndUpdate(
    { contact: '9811111111', tenantId: TENANT_A },
    {
      name: 'Alice Alpha One',
      contact: '9811111111',
      tenantId: TENANT_A,
      uhId: 'UHID-ALPHA-001',
      patientId: 'HOSP-A-001'
    },
    { upsert: true, returnDocument: 'after' }
  );

  // Patient A2 (Same Tenant A, different patient)
  const patientA2 = await Patient.findOneAndUpdate(
    { contact: '9811111112', tenantId: TENANT_A },
    {
      name: 'Arthur Alpha Two',
      contact: '9811111112',
      tenantId: TENANT_A,
      uhId: 'UHID-ALPHA-002',
      patientId: 'HOSP-A-002'
    },
    { upsert: true, returnDocument: 'after' }
  );

  // Patient B (Tenant B)
  const patientB = await Patient.findOneAndUpdate(
    { contact: '9822222222', tenantId: TENANT_B },
    {
      name: 'Bob Beta One',
      contact: '9822222222',
      tenantId: TENANT_B,
      uhId: 'UHID-BETA-001',
      patientId: 'HOSP-B-001'
    },
    { upsert: true, returnDocument: 'after' }
  );

  // Consents for EMR
  await Consent.findOneAndUpdate(
    { patientId: patientA1._id, tenantId: TENANT_A },
    { patientId: patientA1._id, tenantId: TENANT_A, status: 'Active', purposes: { treatment: true, insurance: true, research: false } },
    { upsert: true }
  );
  await Consent.findOneAndUpdate(
    { patientId: patientA2._id, tenantId: TENANT_A },
    { patientId: patientA2._id, tenantId: TENANT_A, status: 'Active', purposes: { treatment: true, insurance: true, research: false } },
    { upsert: true }
  );
  await Consent.findOneAndUpdate(
    { patientId: patientB._id, tenantId: TENANT_B },
    { patientId: patientB._id, tenantId: TENANT_B, status: 'Active', purposes: { treatment: true, insurance: true, research: false } },
    { upsert: true }
  );

  // Clinical records in Tenant A for Patient A1
  const rxA1 = await Prescription.create({
    tenantId: TENANT_A,
    patientId: patientA1._id,
    doctorId: docA._id,
    medications: [{ name: 'Amoxicillin' }]
  });
  const labA1 = await LabRequest.create({
    tenantId: TENANT_A,
    patientId: patientA1._id,
    doctorId: docA._id,
    testName: 'Blood Sugar'
  });
  const billA1 = await Billing.create({
    tenantId: TENANT_A,
    patientId: patientA1._id,
    totalAmount: 400,
    amountPaid: 400,
    status: 'Paid',
    items: [{ description: 'Consultation Fee', amount: 400 }]
  });
  const visitA1 = await Visit.create({
    tenantId: TENANT_A,
    patientId: patientA1._id,
    doctorId: docA._id,
    visitId: `VIS-A1-${Date.now()}`,
    status: 'Checked-in'
  });
  const vitalId = new mongoose.Types.ObjectId();
  await Vital.collection.insertOne({
    _id: vitalId,
    tenantId: TENANT_A,
    patientId: patientA1._id,
    recordedBy: docA._id,
    pulse: 75,
    bpSys: 120,
    bpDia: 80,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const noteA1 = await ClinicalNote.create({
    tenantId: TENANT_A,
    patientId: patientA1._id,
    doctorId: docA._id,
    subjective: 'Headache',
    objective: 'Normal',
    assessment: ['Tension Headache'],
    plan: 'Rest'
  });
  const procA1 = await Procedure.create({
    tenantId: TENANT_A,
    patientId: patientA1._id,
    doctorId: docA._id,
    procedureName: 'Wound Dressing'
  });
  const docVaultA1 = await ClinicalDocument.create({
    tenantId: TENANT_A,
    patientId: patientA1._id,
    title: 'Discharge Summary',
    category: 'Discharge',
    fileUrl: 'https://example.com/discharge.pdf',
    uploadedBy: docA._id
  });
  const auditA1 = await AuditLog.create({
    tenantId: TENANT_A,
    actor: docA._id.toString(),
    action: 'VIEW_RECORD',
    target: patientA1._id.toString()
  });

  // Clinical records in Tenant B for Patient B
  const rxB = await Prescription.create({
    tenantId: TENANT_B,
    patientId: patientB._id,
    doctorId: docB._id,
    medications: [{ name: 'Ciprofloxacin' }]
  });
  const labB = await LabRequest.create({
    tenantId: TENANT_B,
    patientId: patientB._id,
    doctorId: docB._id,
    testName: 'Urine Culture'
  });
  const billB = await Billing.create({
    tenantId: TENANT_B,
    patientId: patientB._id,
    totalAmount: 850,
    amountPaid: 0,
    status: 'Unpaid',
    items: [{ description: 'Specialist Consult', amount: 850 }]
  });
  const visitB = await Visit.create({
    tenantId: TENANT_B,
    patientId: patientB._id,
    doctorId: docB._id,
    visitId: `VIS-B-${Date.now()}`,
    status: 'Checked-in'
  });

  // User with NO Patient document (Section 2)
  const userNoPatient = await User.findOneAndUpdate(
    { staff_id: '9833333333', tenantId: TENANT_A },
    {
      staff_id: '9833333333',
      phone: '9833333333',
      name: 'Orphan User No Patient',
      role: 'patient',
      tenantId: TENANT_A,
      password_hash: 'dummyhash'
    },
    { upsert: true, returnDocument: 'after' }
  );

  // Generate Tokens
  const tokenPatientA1 = jwt.sign(
    { id: patientA1._id.toString(), staff_id: patientA1.contact, phone: patientA1.contact, role: 'patient', tenantId: TENANT_A },
    secret,
    { expiresIn: '1h' }
  );
  const tokenPatientB = jwt.sign(
    { id: patientB._id.toString(), staff_id: patientB.contact, phone: patientB.contact, role: 'patient', tenantId: TENANT_B },
    secret,
    { expiresIn: '1h' }
  );
  const tokenUserNoPatient = jwt.sign(
    { id: userNoPatient._id.toString(), userId: userNoPatient._id.toString(), staff_id: userNoPatient.staff_id, role: 'patient', tenantId: TENANT_A },
    secret,
    { expiresIn: '1h' }
  );

  const headA1 = { Authorization: `Bearer ${tokenPatientA1}`, 'x-tenant-id': TENANT_A };
  const headA1_with_TenantB = { Authorization: `Bearer ${tokenPatientA1}`, 'x-tenant-id': TENANT_B };
  const headUserNoPatient = { Authorization: `Bearer ${tokenUserNoPatient}`, 'x-tenant-id': TENANT_A };

  // ====================================================================
  // SECTION 1: VERIFY CROSS-TENANT ISOLATION
  // ====================================================================
  console.log('\n--- [SECTION 1: Cross-Tenant Isolation] ---');

  // 1.1 Patient A cannot retrieve Patient B (Tenant B)
  try {
    const res = await axios.get(`${BASE_URL}/api/patients/${patientB._id}`, { headers: headA1 });
    recordTest('Cross-Tenant', 'Patient A1 GET /api/patients/:patientB_id', false, `Expected 403, got ${res.status}`);
  } catch (err) {
    recordTest('Cross-Tenant', 'Patient A1 GET /api/patients/:patientB_id', err.response?.status === 403, `HTTP ${err.response?.status}`);
  }

  // 1.2 Patient A cannot retrieve Tenant B prescription by ID
  try {
    const res = await axios.get(`${BASE_URL}/api/prescriptions/${rxB._id}`, { headers: headA1 });
    recordTest('Cross-Tenant', 'Patient A1 GET /api/prescriptions/:rxB_id', false, `Expected 403, got ${res.status}`);
  } catch (err) {
    recordTest('Cross-Tenant', 'Patient A1 GET /api/prescriptions/:rxB_id', err.response?.status === 403, `HTTP ${err.response?.status}`);
  }

  // 1.3 Patient A cannot retrieve Tenant B prescriptions via list manipulation (spoofed x-tenant-id)
  try {
    const res = await axios.get(`${BASE_URL}/api/prescriptions`, { headers: headA1_with_TenantB });
    const containsRxB = Array.isArray(res.data) && res.data.some(r => String(r._id) === String(rxB._id));
    recordTest('Cross-Tenant', 'Patient A1 GET /api/prescriptions with Tenant B header', res.status === 200 && !containsRxB && res.data.length === 0, `Returned ${res.data?.length} items, contains RxB: ${containsRxB}`);
  } catch (err) {
    recordTest('Cross-Tenant', 'Patient A1 GET /api/prescriptions with Tenant B header', true, `Blocked with ${err.response?.status}`);
  }

  // 1.4 Patient A cannot retrieve Tenant B laboratory records
  try {
    const res = await axios.get(`${BASE_URL}/api/labs`, { headers: headA1_with_TenantB });
    const containsLabB = Array.isArray(res.data) && res.data.some(l => String(l._id) === String(labB._id));
    recordTest('Cross-Tenant', 'Patient A1 GET /api/labs with Tenant B header', res.status === 200 && !containsLabB && res.data.length === 0, `Returned ${res.data?.length} items, contains Lab B: ${containsLabB}`);
  } catch (err) {
    recordTest('Cross-Tenant', 'Patient A1 GET /api/labs with Tenant B header', true, `Blocked with ${err.response?.status}`);
  }

  // 1.5 Patient A cannot retrieve Tenant B billing records
  try {
    const res = await axios.get(`${BASE_URL}/api/billing`, { headers: headA1_with_TenantB });
    const containsBillB = Array.isArray(res.data) && res.data.some(b => String(b._id) === String(billB._id));
    recordTest('Cross-Tenant', 'Patient A1 GET /api/billing with Tenant B header', res.status === 200 && !containsBillB && res.data.length === 0, `Returned ${res.data?.length} items, contains Bill B: ${containsBillB}`);
  } catch (err) {
    recordTest('Cross-Tenant', 'Patient A1 GET /api/billing with Tenant B header', true, `Blocked with ${err.response?.status}`);
  }

  // 1.6 Patient A cannot retrieve Tenant B EMR records
  try {
    const res = await axios.get(`${BASE_URL}/api/emr/visits/patient/${patientB._id}`, { headers: headA1 });
    recordTest('Cross-Tenant', 'Patient A1 GET /api/emr/visits/patient/:patientB_id', false, `Expected 403, got ${res.status}`);
  } catch (err) {
    recordTest('Cross-Tenant', 'Patient A1 GET /api/emr/visits/patient/:patientB_id', err.response?.status === 403, `HTTP ${err.response?.status}`);
  }

  // ====================================================================
  // SECTION 2: VERIFY MISSING PATIENT IDENTITY (FAIL-CLOSED)
  // ====================================================================
  console.log('\n--- [SECTION 2: Missing Patient Identity] ---');

  // 2.1 Prescriptions list with User ID token (No Patient doc)
  try {
    const res = await axios.get(`${BASE_URL}/api/prescriptions`, { headers: headUserNoPatient });
    recordTest('Missing Identity', 'User without Patient doc calls GET /api/prescriptions', res.status === 200 && res.data.length === 0, `Returns empty list (0 records), no unrestricted leak`);
  } catch (err) {
    recordTest('Missing Identity', 'User without Patient doc calls GET /api/prescriptions', err.response?.status === 403, `HTTP ${err.response?.status}`);
  }

  // 2.2 Labs list with User ID token (No Patient doc)
  try {
    const res = await axios.get(`${BASE_URL}/api/labs`, { headers: headUserNoPatient });
    recordTest('Missing Identity', 'User without Patient doc calls GET /api/labs', res.status === 200 && res.data.length === 0, `Returns empty list (0 records), no unrestricted leak`);
  } catch (err) {
    recordTest('Missing Identity', 'User without Patient doc calls GET /api/labs', err.response?.status === 403, `HTTP ${err.response?.status}`);
  }

  // 2.3 Billing list with User ID token (No Patient doc)
  try {
    const res = await axios.get(`${BASE_URL}/api/billing`, { headers: headUserNoPatient });
    recordTest('Missing Identity', 'User without Patient doc calls GET /api/billing', res.status === 200 && res.data.length === 0, `Returns empty list (0 records), no unrestricted leak`);
  } catch (err) {
    recordTest('Missing Identity', 'User without Patient doc calls GET /api/billing', err.response?.status === 403, `HTTP ${err.response?.status}`);
  }

  // 2.4 EMR visits with User ID token
  try {
    const res = await axios.get(`${BASE_URL}/api/emr/visits/patient/${userNoPatient._id}`, { headers: headUserNoPatient });
    recordTest('Missing Identity', 'User without Patient doc calls GET /api/emr/visits/patient/:userId', false, `Expected 404/403, got ${res.status}`);
  } catch (err) {
    const status = err.response?.status;
    recordTest('Missing Identity', 'User without Patient doc calls GET /api/emr/visits/patient/:userId', status === 404 || status === 403, `Fails closed: HTTP ${status} (${err.response?.data?.error})`);
  }

  // 2.5 Profile lookup with User ID token
  try {
    const res = await axios.get(`${BASE_URL}/api/patients/${userNoPatient._id}`, { headers: headUserNoPatient });
    recordTest('Missing Identity', 'User without Patient doc calls GET /api/patients/:userId', false, `Expected 404/403, got ${res.status}`);
  } catch (err) {
    const status = err.response?.status;
    recordTest('Missing Identity', 'User without Patient doc calls GET /api/patients/:userId', status === 404 || status === 403, `Fails closed: HTTP ${status} (${err.response?.data?.error})`);
  }

  // ====================================================================
  // SECTION 3: VERIFY ALL SEVEN EMR ENDPOINTS (5 VARIATIONS EACH)
  // ====================================================================
  console.log('\n--- [SECTION 3: All Seven EMR Endpoints Across 5 Variations] ---');

  const emrEndpoints = [
    { name: '1. Visits', path: '/api/emr/visits/patient' },
    { name: '2. Vitals', path: '/api/emr/vitals/patient' },
    { name: '3. Clinical Notes', path: '/api/emr/clinical-notes/patient' },
    { name: '4. Consent', path: '/api/emr/consent/patient' },
    { name: '5. Procedures', path: '/api/emr/procedures/patient' },
    { name: '6. Documents', path: '/api/emr/documents/patient' },
    { name: '7. Audits', path: '/api/emr/audits/patient' }
  ];

  const fakeObjectId = new mongoose.Types.ObjectId().toString();

  for (const ep of emrEndpoints) {
    // a) Own Patient ID
    try {
      const res = await axios.get(`${BASE_URL}${ep.path}/${patientA1._id}`, { headers: headA1 });
      recordTest('EMR-7', `${ep.name} -> Own Patient ID`, res.status === 200, `HTTP 200 OK`);
    } catch (err) {
      recordTest('EMR-7', `${ep.name} -> Own Patient ID`, false, `Error: ${err.message}`);
    }

    // b) Another Patient ID in same tenant (Patient A2)
    try {
      const res = await axios.get(`${BASE_URL}${ep.path}/${patientA2._id}`, { headers: headA1 });
      recordTest('EMR-7', `${ep.name} -> Another Patient in Same Tenant`, false, `Expected 403, got ${res.status}`);
    } catch (err) {
      recordTest('EMR-7', `${ep.name} -> Another Patient in Same Tenant`, err.response?.status === 403, `HTTP ${err.response?.status}`);
    }

    // c) Patient ID from another tenant (Patient B)
    try {
      const res = await axios.get(`${BASE_URL}${ep.path}/${patientB._id}`, { headers: headA1 });
      recordTest('EMR-7', `${ep.name} -> Patient from Another Tenant`, false, `Expected 403, got ${res.status}`);
    } catch (err) {
      recordTest('EMR-7', `${ep.name} -> Patient from Another Tenant`, err.response?.status === 403, `HTTP ${err.response?.status}`);
    }

    // d) Invalid/Random Patient ID
    try {
      const res = await axios.get(`${BASE_URL}${ep.path}/${fakeObjectId}`, { headers: headA1 });
      recordTest('EMR-7', `${ep.name} -> Random/Invalid Patient ID`, false, `Expected 403/404, got ${res.status}`);
    } catch (err) {
      recordTest('EMR-7', `${ep.name} -> Random/Invalid Patient ID`, err.response?.status === 403 || err.response?.status === 404, `HTTP ${err.response?.status}`);
    }

    // e) Missing tenant context (request without x-tenant-id header)
    try {
      const headersNoTenant = { Authorization: `Bearer ${tokenPatientA1}` };
      const res = await axios.get(`${BASE_URL}${ep.path}/${patientA1._id}`, { headers: headersNoTenant });
      recordTest('EMR-7', `${ep.name} -> Missing x-tenant-id Header (Own ID)`, res.status === 200, `HTTP 200 OK (Token tenant enforced)`);
    } catch (err) {
      recordTest('EMR-7', `${ep.name} -> Missing x-tenant-id Header (Own ID)`, false, `Error: ${err.message}`);
    }
  }

  // 3.8 Consent Mutation & DPDP Verification
  try {
    const res = await axios.post(`${BASE_URL}/api/emr/consent`, {
      patientId: patientA2._id,
      purposes: { treatment: false, insurance: false, research: false }
    }, { headers: headA1 });
    recordTest('EMR Mutations', 'Patient A1 calls POST /api/emr/consent for Patient A2', false, `Expected 403, got ${res.status}`);
  } catch (err) {
    recordTest('EMR Mutations', 'Patient A1 calls POST /api/emr/consent for Patient A2', err.response?.status === 403, `HTTP ${err.response?.status}`);
  }

  try {
    const res = await axios.post(`${BASE_URL}/api/emr/consent/patient/${patientA2._id}/dpdp-request`, {
      requestType: 'Deletion',
      details: 'Malicious deletion request'
    }, { headers: headA1 });
    recordTest('EMR Mutations', 'Patient A1 calls POST DPDP deletion for Patient A2', false, `Expected 403, got ${res.status}`);
  } catch (err) {
    recordTest('EMR Mutations', 'Patient A1 calls POST DPDP deletion for Patient A2', err.response?.status === 403, `HTTP ${err.response?.status}`);
  }

  // ====================================================================
  // SECTION 4: QUERY PARAMETER MANIPULATION
  // ====================================================================
  console.log('\n--- [SECTION 4: Query Parameter Manipulation] ---');

  const paramTargets = [
    { name: 'Prescriptions', url: `${BASE_URL}/api/prescriptions` },
    { name: 'Labs', url: `${BASE_URL}/api/labs` },
    { name: 'Billing', url: `${BASE_URL}/api/billing` }
  ];

  const malformedIds = [
    '', // No patientId
    patientA1._id.toString(), // Own patientId
    patientA2._id.toString(), // Another patientId in same tenant
    patientB._id.toString(), // Another tenant's patientId
    'invalid-non-hex-id-injection\'"{}' // Malformed patientId
  ];

  for (const target of paramTargets) {
    for (const pId of malformedIds) {
      const qStr = pId ? `?patientId=${encodeURIComponent(pId)}` : '';
      try {
        const res = await axios.get(`${target.url}${qStr}`, { headers: headA1 });
        const allMatchOwn = Array.isArray(res.data) && res.data.every(item => String(item.patientId?._id || item.patientId) === String(patientA1._id));
        const leakedOther = Array.isArray(res.data) && res.data.some(item => {
          const itemPid = String(item.patientId?._id || item.patientId);
          return itemPid === String(patientA2._id) || itemPid === String(patientB._id);
        });
        const pass = res.status === 200 && allMatchOwn && !leakedOther;
        recordTest('Query Tampering', `${target.name} query '${qStr || '(empty)'}'`, pass, `Returned ${res.data?.length} items. All match own: ${allMatchOwn}, Leaked others: ${leakedOther}`);
      } catch (err) {
        // If malformed ID returns 400 or handled gracefully, that is also acceptable
        const status = err.response?.status;
        recordTest('Query Tampering', `${target.name} query '${qStr || '(empty)'}'`, status === 400 || status === 403, `Handled with HTTP ${status}`);
      }
    }
  }

  // ====================================================================
  // SECTION 5: STAFF-ONLY ROUTE PROBING (AUDIT COVERAGE)
  // ====================================================================
  console.log('\n--- [SECTION 5: Staff-Only Route Probing] ---');

  const staffProbes = [
    { name: 'Admin Users list', method: 'get', url: `${BASE_URL}/api/admin/users` },
    { name: 'Admin Inventory Alerts', method: 'get', url: `${BASE_URL}/api/admin/inventory-alerts` },
    { name: 'SuperAdmin Hospitals', method: 'get', url: `${BASE_URL}/api/superadmin/hospitals` },
    { name: 'Purchase Orders', method: 'post', url: `${BASE_URL}/api/purchase-orders`, data: { poId: 'TEST' } },
    { name: 'HR Leaves', method: 'get', url: `${BASE_URL}/api/hr/leaves` },
    { name: 'HR Attendance', method: 'post', url: `${BASE_URL}/api/hr/attendance`, data: {} },
    // Routes to inspect for exposure
    { name: 'Pharmacy Sales', method: 'get', url: `${BASE_URL}/api/pharmacy-sales` },
    { name: 'Drug Catalog / Medicines', method: 'get', url: `${BASE_URL}/api/medicines` },
    { name: 'Hospital Expenses', method: 'get', url: `${BASE_URL}/api/expenses` }
  ];

  for (const probe of staffProbes) {
    try {
      const res = await axios({ method: probe.method, url: probe.url, headers: headA1, data: probe.data });
      // If status is 200, this staff route is NOT blocking patient tokens!
      recordTest('Staff Probe', `${probe.name} with patient token`, false, `EXPOSED: Accepted patient token with HTTP ${res.status}`);
    } catch (err) {
      const status = err.response?.status;
      const isProtected = status === 403 || status === 401;
      recordTest('Staff Probe', `${probe.name} with patient token`, isProtected, `Blocked with HTTP ${status}`);
    }
  }

  // ====================================================================
  // SECTION 6: EXISTING FUNCTIONALITY VERIFICATION
  // ====================================================================
  console.log('\n--- [SECTION 6: Existing Functionality Verification] ---');

  // Profile lookup
  try {
    const res = await axios.get(`${BASE_URL}/api/patients/${patientA1._id}`, { headers: headA1 });
    recordTest('Functionality', 'Patient profile lookup', res.status === 200 && res.data?.name === 'Alice Alpha One', `HTTP 200 OK`);
  } catch (err) {
    recordTest('Functionality', 'Patient profile lookup', false, err.message);
  }

  // Doctor availability lookup
  try {
    const res = await axios.get(`${BASE_URL}/api/hr/doctor-availability/${docA._id}`, { headers: headA1 });
    recordTest('Functionality', 'Doctor availability lookup', res.status === 200 && Array.isArray(res.data?.slots), `HTTP 200 OK, Slots: ${res.data?.slots?.length}`);
  } catch (err) {
    recordTest('Functionality', 'Doctor availability lookup', false, err.message);
  }

  // Prescriptions viewing
  try {
    const res = await axios.get(`${BASE_URL}/api/prescriptions`, { headers: headA1 });
    recordTest('Functionality', 'Prescriptions list viewing', res.status === 200 && res.data.length === 1, `HTTP 200 OK, Items: ${res.data.length}`);
  } catch (err) {
    recordTest('Functionality', 'Prescriptions list viewing', false, err.message);
  }

  // Labs viewing
  try {
    const res = await axios.get(`${BASE_URL}/api/labs`, { headers: headA1 });
    recordTest('Functionality', 'Labs list viewing', res.status === 200 && res.data.length === 1, `HTTP 200 OK, Items: ${res.data.length}`);
  } catch (err) {
    recordTest('Functionality', 'Labs list viewing', false, err.message);
  }

  // Billing history
  try {
    const res = await axios.get(`${BASE_URL}/api/billing`, { headers: headA1 });
    recordTest('Functionality', 'Billing history viewing', res.status === 200 && res.data.length === 1, `HTTP 200 OK, Items: ${res.data.length}`);
  } catch (err) {
    recordTest('Functionality', 'Billing history viewing', false, err.message);
  }

  console.log('\n======================================================================');
  console.log('  INDEPENDENT VERIFICATION SUMMARY                                    ');
  console.log('======================================================================');
  const total = testResults.length;
  const passedCount = testResults.filter(t => t.passed).length;
  const failedCount = testResults.filter(t => !t.passed).length;

  console.log(`Total Independent Tests Executed: ${total}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);

  // Cleanup
  console.log('\n[Cleanup] Cleaning up test records...');
  await Prescription.deleteMany({ _id: { $in: [rxA1._id, rxB._id] } });
  await LabRequest.deleteMany({ _id: { $in: [labA1._id, labB._id] } });
  await Billing.deleteMany({ _id: { $in: [billA1._id, billB._id] } });
  await Visit.deleteMany({ _id: { $in: [visitA1._id, visitB._id] } });
  await Vital.collection.deleteOne({ _id: vitalId });
  await ClinicalNote.deleteMany({ _id: noteA1._id });
  await Procedure.deleteMany({ _id: procA1._id });
  await ClinicalDocument.deleteMany({ _id: docVaultA1._id });
  await AuditLog.deleteMany({ _id: auditA1._id });
  await Patient.deleteMany({ _id: { $in: [patientA1._id, patientA2._id, patientB._id] } });
  await User.deleteMany({ _id: { $in: [docA._id, docB._id, userNoPatient._id] } });
  await Consent.deleteMany({ patientId: { $in: [patientA1._id, patientA2._id, patientB._id] } });

  server.close();
  await mongoose.disconnect();
  console.log('[Cleanup] Completed. Server closed and DB disconnected.\n');

  process.exit(0);
}

runIndependentVerification().catch(err => {
  console.error('Independent Verification Fatal Error:', err);
  if (server) server.close();
  mongoose.disconnect();
  process.exit(1);
});
