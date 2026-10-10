require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');
const express = require('express');
const User = require('../models/User');
const Counter = require('../models/Counter');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const adminRouter = require('../routes/adminRoutes');
const authRouter = require('../routes/authRoutes');
const { generateHospitalEmployeeId } = require('../utils/identifierEngine');
const { getJwtSecret } = require('../config/env');

async function runEmployeeOnboardingTests() {
  console.log('===================================================================');
  console.log('QUROXA — EMPLOYEE ONBOARDING: TITLE, RELATIONSHIP & EMPLOYEE ID');
  console.log('AUTOMATED VERIFICATION TEST SUITE (16 ASSERTIONS)');
  console.log('===================================================================');

  await mongoose.connect(process.env.MONGO_URI);
  console.log(' Connected to MongoDB\n');

  await User.syncIndexes();

  const tenantA = 'tenant_emp_test_a_' + Date.now();
  const tenantB = 'tenant_emp_test_b_' + Date.now();

  let passedCount = 0;
  let failedCount = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  PASS: ${testName}`);
      passedCount++;
    } else {
      console.error(`  FAIL: ${testName}`);
      failedCount++;
    }
  }

  const hospIdA = 'HSP-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  const hospIdB = 'HSP-' + Math.random().toString(36).substring(2, 8).toUpperCase();

  // Ensure test hospital subscriptions exist for limits check
  await SuperAdminHospital.create([
    {
      code: tenantA,
      hospitalId: hospIdA,
      name: 'Test Hospital A',
      status: 'active',
      subscriptionStatus: 'ACTIVE',
      limits: { staffLimit: 50 }
    },
    {
      code: tenantB,
      hospitalId: hospIdB,
      name: 'Test Hospital B',
      status: 'active',
      subscriptionStatus: 'ACTIVE',
      limits: { staffLimit: 50 }
    }
  ]);

  let secret;
  try {
    secret = getJwtSecret();
  } catch (e) {
    secret = process.env.JWT_SECRET || 'secret_key';
  }

  const adminTokenA = jwt.sign(
    { role: 'admin', tenantId: tenantA, name: 'Admin User A', staff_id: 'admin_a_01' },
    secret,
    { expiresIn: '1h' }
  );

  const adminTokenB = jwt.sign(
    { role: 'admin', tenantId: tenantB, name: 'Admin User B', staff_id: 'admin_b_01' },
    secret,
    { expiresIn: '1h' }
  );

  const app = express();
  app.use(express.json());

  // Attach tenant context helper middleware matching production auth middleware
  app.use((req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], secret);
        req.tenantId = decoded.tenantId;
        req.user = decoded;
      } catch (err) {}
    }
    next();
  });

  app.use('/admin', adminRouter);
  app.use('/auth', authRouter);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  async function reqApi(method, path, data, token) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    };
    if (data) opts.body = JSON.stringify(data);
    const res = await fetch(`${baseUrl}${path}`, opts);
    const body = await res.json().catch(() => ({}));
    return { status: res.status, body };
  }

  try {
    // -------------------------------------------------------------
    // Assertion 1 & 2: Creation with Title, separate from Full Legal Name
    // -------------------------------------------------------------
    const resEmp1 = await reqApi('POST', '/admin/users', {
      title: 'Dr.',
      name: 'Rajesh Sharma',
      phone: '9876500001',
      staff_id: '9876500001',
      password: 'Password123!',
      role: 'doctor',
      department: 'General Medicine',
      designation: 'Consultant Practitioner',
      emergencyContact: {
        name: 'Sunita Sharma',
        relation: 'Spouse',
        phone: '9876500099'
      }
    }, adminTokenA);

    assert(resEmp1.status === 201 || resEmp1.status === 200, 'Assertion 1: Employee creation returns HTTP 200/201');
    const emp1 = resEmp1.body;
    assert(emp1.title === 'Dr.', 'Assertion 1.1: Title "Dr." correctly stored');
    assert(emp1.name === 'Rajesh Sharma', 'Assertion 1.2: Full Legal Name is preserved without prefix mutation');

    // -------------------------------------------------------------
    // Assertion 3: Defaulting / Persistence on query
    // -------------------------------------------------------------
    const fetchedEmp1 = await User.findById(emp1._id);
    assert(fetchedEmp1 && fetchedEmp1.title === 'Dr.', 'Assertion 2: Stored title persists upon direct DB query');

    // -------------------------------------------------------------
    // Assertion 4: Backend authoritative Employee ID format (EMP-XXXXXX)
    // -------------------------------------------------------------
    assert(/^EMP-\d{6}$/.test(emp1.employeeId), `Assertion 4: Generated Employee ID format is EMP-XXXXXX (got: ${emp1.employeeId})`);
    assert(emp1.employeeId === 'EMP-000001', `Assertion 4.1: First employee in Tenant A receives EMP-000001 (got: ${emp1.employeeId})`);

    // -------------------------------------------------------------
    // Assertion 5: Client-side spoof protection (authoritative backend generation)
    // -------------------------------------------------------------
    const resSpoof = await reqApi('POST', '/admin/users', {
      title: 'Mr.',
      name: 'Spoof Attempt User',
      phone: '9876500002',
      staff_id: '9876500002',
      employeeId: 'CLIENT_SPOOFED_ID', // Client attempting to force custom ID
      password: 'Password123!',
      role: 'receptionist'
    }, adminTokenA);

    assert(resSpoof.status === 200 || resSpoof.status === 201, 'Assertion 5: Employee creation with spoof attempt succeeds');
    const spoofEmp = resSpoof.body;
    assert(spoofEmp.employeeId !== 'CLIENT_SPOOFED_ID', 'Assertion 5.1: Client-supplied employeeId was ignored/rejected');
    assert(spoofEmp.employeeId === 'EMP-000002', `Assertion 5.2: Backend generated sequential authoritative ID EMP-000002 (got: ${spoofEmp.employeeId})`);

    // -------------------------------------------------------------
    // Assertion 6: Tenant Isolation (Tenant B starts its own independent EMP-000001)
    // -------------------------------------------------------------
    const resEmpB1 = await reqApi('POST', '/admin/users', {
      title: 'Ms.',
      name: 'Pooja Verma',
      phone: '9876500003',
      staff_id: '9876500003',
      password: 'Password123!',
      role: 'nurse'
    }, adminTokenB);

    assert(resEmpB1.status === 200 || resEmpB1.status === 201, 'Assertion 6: Tenant B employee creation succeeds');
    assert(resEmpB1.body.employeeId === 'EMP-000001', `Assertion 6.1: Tenant B receives EMP-000001 independently (got: ${resEmpB1.body.employeeId})`);

    // -------------------------------------------------------------
    // Assertion 7: Uniqueness and Isolation between tenants verified
    // -------------------------------------------------------------
    const usersWithEmp01 = await User.find({ employeeId: 'EMP-000001' });
    assert(usersWithEmp01.length === 2, 'Assertion 7: Two separate tenants each possess their isolated EMP-000001 without collision');

    // -------------------------------------------------------------
    // Assertion 8: Uniqueness within tenant enforced
    // -------------------------------------------------------------
    let duplicateIndexViolation = false;
    try {
      await User.create({
        tenantId: tenantA,
        employeeId: 'EMP-000001', // Duplicate within Tenant A
        staff_id: '9876599999',
        name: 'Duplicate ID Collision User',
        role: 'nurse',
        password_hash: 'hash'
      });
    } catch (err) {
      if (err.code === 11000) {
        duplicateIndexViolation = true;
      }
    }
    assert(duplicateIndexViolation, 'Assertion 8: Compound unique index ({ tenantId: 1, employeeId: 1 }) prevents collision within same tenant');

    // -------------------------------------------------------------
    // Assertion 9: System Login ID (staff_id) strictly separate from Employee ID
    // -------------------------------------------------------------
    assert(emp1.staff_id === '9876500001', `Assertion 9.1: System Login ID is phone/username (got: ${emp1.staff_id})`);
    assert(emp1.staff_id !== emp1.employeeId, 'Assertion 9.2: System Login ID and Employee ID are distinct fields');

    // -------------------------------------------------------------
    // Assertion 10 & 11: Controlled Relationship dropdown persistence
    // -------------------------------------------------------------
    assert(emp1.emergencyContact && emp1.emergencyContact.relation === 'Spouse', 'Assertion 10: Relationship "Spouse" saved in emergencyContact');

    const resEmpRelationOther = await reqApi('POST', '/admin/users', {
      title: 'Mrs.',
      name: 'Anita Roy',
      phone: '9876500004',
      staff_id: '9876500004',
      password: 'Password123!',
      role: 'receptionist',
      emergencyContact: {
        name: 'Somnath Roy',
        relation: 'Parent',
        phone: '9876500088'
      }
    }, adminTokenA);
    assert(resEmpRelationOther.body.emergencyContact?.relation === 'Parent', 'Assertion 11: Relationship "Parent" stored successfully');

    // -------------------------------------------------------------
    // Assertion 12: Legacy / Existing relationship strings remain readable
    // -------------------------------------------------------------
    const legacyUser = await User.create({
      tenantId: tenantA,
      staff_id: '9876500095',
      name: 'Legacy Staff Member',
      role: 'lab',
      password_hash: 'hash',
      emergencyContact: {
        name: 'Elder Uncle',
        relation: 'Paternal Uncle / Extended Family',
        phone: '9876500077'
      }
    });
    const fetchedLegacy = await User.findById(legacyUser._id);
    assert(fetchedLegacy.emergencyContact.relation === 'Paternal Uncle / Extended Family', 'Assertion 12: Custom legacy relationship string preserved without corruption');

    // -------------------------------------------------------------
    // Assertion 13 & 14: Employee update preserves Employee ID & updates Title / Relation
    // -------------------------------------------------------------
    const resUpdate = await reqApi('PUT', `/admin/users/${emp1._id}`, {
      title: 'Dr.',
      name: 'Rajesh Sharma MD',
      employeeId: 'ATTEMPT_OVERWRITE_ID', // Should be ignored/preserved
      emergencyContact: {
        name: 'Sunita Sharma',
        relation: 'Guardian',
        phone: '9876500099'
      }
    }, adminTokenA);

    assert(resUpdate.status === 200, 'Assertion 13: PUT /admin/users/:id succeeds');
    const updatedEmp = resUpdate.body;
    assert(updatedEmp.employeeId === 'EMP-000001', `Assertion 13.1: Employee ID EMP-000001 remained immutable upon update (got: ${updatedEmp.employeeId})`);
    assert(updatedEmp.emergencyContact?.relation === 'Guardian', 'Assertion 14: Emergency relationship updated to "Guardian"');
    assert(updatedEmp.title === 'Dr.', 'Assertion 14.1: Title persisted across update');

    // -------------------------------------------------------------
    // Assertion 15: Legacy employee missing employeeId backfilled on update
    // -------------------------------------------------------------
    assert(!legacyUser.employeeId, 'Assertion 15.0: Legacy user originally had no employeeId');
    const resBackfill = await reqApi('PUT', `/admin/users/${legacyUser._id}`, {
      title: 'Mr.',
      name: 'Legacy Staff Member Updated'
    }, adminTokenA);
    assert(resBackfill.status === 200, 'Assertion 15.1: Updating legacy user succeeds');
    assert(/^EMP-\d{6}$/.test(resBackfill.body.employeeId), `Assertion 15.2: Legacy user received backfilled Employee ID upon update (got: ${resBackfill.body.employeeId})`);

    // -------------------------------------------------------------
    // Assertion 16: Authentication integrity & token payload includes title & employeeId
    // -------------------------------------------------------------
    const resAllUsers = await reqApi('GET', '/auth/users/all', null, adminTokenA);

    assert(resAllUsers.status === 200, 'Assertion 16.0: GET /auth/users/all succeeds');
    const foundInAll = resAllUsers.body.find(u => u.staff_id === emp1.staff_id);
    assert(foundInAll && foundInAll.employeeId === 'EMP-000001', 'Assertion 16.1: /auth/users/all outputs employeeId');
    assert(foundInAll && foundInAll.title === 'Dr.', 'Assertion 16.2: /auth/users/all outputs title');

    // Clean up test tenants
    await User.deleteMany({ tenantId: { $in: [tenantA, tenantB] } });
    await Counter.deleteMany({ key: { $in: [`emp:${tenantA}`, `emp:${tenantB}`] } });
    await SuperAdminHospital.deleteMany({ code: { $in: [tenantA, tenantB] } });

  } catch (err) {
    console.error('Test execution error:', err);
    failedCount++;
  } finally {
    server.close();
    await mongoose.disconnect();
  }

  console.log('\n===================================================================');
  console.log(`TEST RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('===================================================================');
  process.exit(failedCount > 0 ? 1 : 0);
}

runEmployeeOnboardingTests();
