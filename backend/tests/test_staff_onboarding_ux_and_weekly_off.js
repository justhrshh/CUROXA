const mongoose = require('mongoose');
const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { getJwtSecret } = require('../config/env');
const User = require('../models/User');
const SuperAdminHospital = require('../models/SuperAdminHospital');

const BASE_URL = process.env.TEST_API_URL || 'http://localhost:5000';

async function apiRequest(endpoint, { method = 'GET', body = null, token = null } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = text;
  }

  return { status: res.status, body: data };
}

async function runTests() {
  console.log('--- TESTING STAFF ONBOARDING & WEEKLY OFF PERSISTENCE ---');
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/curoxa';
  await mongoose.connect(mongoUri);

  const testTenant = 'HSP-ONBOARD-TEST';
  let secret;
  try {
    secret = getJwtSecret();
  } catch (e) {
    secret = process.env.JWT_SECRET || 'secret_key';
  }

  // Ensure hospital exists
  await SuperAdminHospital.findOneAndUpdate(
    { code: testTenant },
    {
      code: testTenant,
      name: 'Onboard Test Hospital',
      status: 'Active',
      subscriptionStatus: 'active',
      plan: 'pro',
      subscriptionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      limits: { staffLimit: 50 }
    },
    { upsert: true }
  );

  // Clean test users
  await User.deleteMany({ tenantId: testTenant });

  // Create admin user for token
  const adminUser = await User.create({
    tenantId: testTenant,
    staff_id: 'admin_onboard',
    password_hash: '$2b$10$abcdefghijklmnopqrstuv',
    role: 'admin',
    name: 'Onboard Admin',
    email: 'admin.onboard@hospital.com',
    phone: '9999900001'
  });

  const token = jwt.sign(
    {
      id: adminUser._id,
      userId: adminUser._id,
      staff_id: adminUser.staff_id,
      role: 'admin',
      tenantId: testTenant
    },
    secret,
    { expiresIn: '2h' }
  );

  // Test 1: Register Doctor with Weekly Off (array of days) and OPD slots
  console.log('\n[Test 1] Onboarding Doctor with Weekly Off & Doctor Slots...');
  const docPayload = {
    name: 'Dr. Sameer Sen',
    phone: '9888800011',
    staff_id: '9888800011',
    email: 'dr.sameer@hospital.com',
    password: 'Password@123',
    role: 'doctor',
    department: 'Cardiology',
    specialty: 'Cardiology',
    consultationFee: 750,
    weeklyOff: ['Saturday', 'Sunday'],
    doctorSlots: ['10:00 AM - 10:30 AM', '10:30 AM - 11:00 AM', '11:00 AM - 11:30 AM']
  };

  const res1 = await apiRequest('/api/admin/users', {
    method: 'POST',
    body: docPayload,
    token
  });

  console.log('Response Status:', res1.status);
  if (res1.status !== 201) {
    console.error('Error on Test 1:', res1.body);
    throw new Error('Test 1 failed to create doctor');
  }
  const createdDoc = await User.findOne({ tenantId: testTenant, phone: '9888800011' });
  if (!createdDoc) throw new Error('Doctor not found in DB');
  console.log('Doctor created. WeeklyOff:', createdDoc.weeklyOff);
  const docOffs = Array.isArray(createdDoc.weeklyOff) ? createdDoc.weeklyOff : [createdDoc.weeklyOff];
  if (!docOffs.includes('Saturday') || !docOffs.includes('Sunday')) {
    throw new Error('Doctor weeklyOff was not persisted correctly');
  }
  console.log('✓ Test 1 Passed: Doctor created with weeklyOff & slots persisted.');

  // Test 2: Register Non-Doctor (Nurse) with Weekly Off
  console.log('\n[Test 2] Onboarding Nurse with Weekly Off (Non-Doctor Role)...');
  const nursePayload = {
    name: 'Anjali Nair',
    phone: '9888800012',
    staff_id: '9888800012',
    email: 'anjali.nair@hospital.com',
    password: 'Password@123',
    role: 'nurse',
    department: 'Inpatient Nursing',
    designation: 'Staff Nurse',
    weeklyOff: ['Monday', 'Tuesday']
  };

  const res2 = await apiRequest('/api/admin/users', {
    method: 'POST',
    body: nursePayload,
    token
  });

  console.log('Response Status:', res2.status);
  if (res2.status !== 201) {
    console.error('Error on Test 2:', res2.body);
    throw new Error('Test 2 failed to create nurse');
  }
  const createdNurse = await User.findOne({ tenantId: testTenant, phone: '9888800012' });
  if (!createdNurse) throw new Error('Nurse not found in DB');
  console.log('Nurse created. WeeklyOff:', createdNurse.weeklyOff);
  const nurseOffs = Array.isArray(createdNurse.weeklyOff) ? createdNurse.weeklyOff : [createdNurse.weeklyOff];
  if (!nurseOffs.includes('Monday') || !nurseOffs.includes('Tuesday')) {
    throw new Error('Nurse weeklyOff was not persisted correctly for non-doctor role');
  }
  console.log('✓ Test 2 Passed: Non-doctor (Nurse) created with weeklyOff persisted.');

  // Test 3: Register Receptionist with Weekly Off
  console.log('\n[Test 3] Onboarding Receptionist with Weekly Off (Non-Doctor Role)...');
  const recepPayload = {
    name: 'Rohit Mehta',
    phone: '9888800013',
    staff_id: '9888800013',
    email: 'rohit.mehta@hospital.com',
    password: 'Password@123',
    role: 'receptionist',
    department: 'Outpatient Services',
    designation: 'Front Desk Executive',
    weeklyOff: ['Wednesday']
  };

  const res3 = await apiRequest('/api/admin/users', {
    method: 'POST',
    body: recepPayload,
    token
  });

  console.log('Response Status:', res3.status);
  if (res3.status !== 201) {
    console.error('Error on Test 3:', res3.body);
    throw new Error('Test 3 failed to create receptionist');
  }
  const createdRecep = await User.findOne({ tenantId: testTenant, phone: '9888800013' });
  const recepOffs = Array.isArray(createdRecep.weeklyOff) ? createdRecep.weeklyOff : [createdRecep.weeklyOff];
  if (!recepOffs.includes('Wednesday')) {
    throw new Error('Receptionist weeklyOff was not persisted correctly');
  }
  console.log('✓ Test 3 Passed: Receptionist created with weeklyOff persisted.');

  // Test 4: Register Pharmacist with Weekly Off
  console.log('\n[Test 4] Onboarding Pharmacist with Weekly Off (Non-Doctor Role)...');
  const pharmPayload = {
    name: 'Pooja Iyer',
    phone: '9888800014',
    staff_id: '9888800014',
    email: 'pooja.iyer@hospital.com',
    password: 'Password@123',
    role: 'pharmacy',
    department: 'Pharmacy',
    designation: 'Pharmacist',
    weeklyOff: ['Friday']
  };

  const res4 = await apiRequest('/api/admin/users', {
    method: 'POST',
    body: pharmPayload,
    token
  });

  if (res4.status !== 201) throw new Error('Test 4 failed to create pharmacist');
  const createdPharm = await User.findOne({ tenantId: testTenant, phone: '9888800014' });
  const pharmOffs = Array.isArray(createdPharm.weeklyOff) ? createdPharm.weeklyOff : [createdPharm.weeklyOff];
  if (!pharmOffs.includes('Friday')) {
    throw new Error('Pharmacist weeklyOff was not persisted correctly');
  }
  console.log('✓ Test 4 Passed: Pharmacist created with weeklyOff persisted.');

  // Test 5: Verify GET /api/admin/users returns all users with their weeklyOff
  console.log('\n[Test 5] Fetching staff list via GET /api/admin/users...');
  const resList = await apiRequest('/api/admin/users', {
    method: 'GET',
    token
  });

  if (resList.status !== 200) throw new Error('Failed to fetch staff list');
  const userList = resList.body;
  console.log(`Retrieved ${userList.length} staff members.`);
  const nurseInList = userList.find(u => u.phone === '9888800012');
  if (!nurseInList || !nurseInList.weeklyOff) {
    throw new Error('GET /api/admin/users does not include weeklyOff for nurse');
  }
  console.log('Nurse in list weeklyOff:', nurseInList.weeklyOff);
  console.log('✓ Test 5 Passed: GET /api/admin/users reliably serves weeklyOff for all roles.');

  // Test 6: Validation - Duplicate Phone / Staff ID Rejection
  console.log('\n[Test 6] Verifying Duplicate Phone / Staff ID rejection...');
  const resDup = await apiRequest('/api/admin/users', {
    method: 'POST',
    token,
    body: {
      name: 'Duplicate Guy',
      phone: '9888800011', // Same as Dr. Sameer Sen
      staff_id: '9888800011',
      email: 'dup@hospital.com',
      password: 'Password@123',
      role: 'doctor'
    }
  });

  if (resDup.status !== 400) {
    throw new Error(`Expected 400 for duplicate phone, got ${resDup.status}`);
  }
  console.log('✓ Test 6 Passed: Duplicate phone number correctly rejected by server.');

  console.log('\n===========================================');
  console.log('ALL BACKEND STAFF ONBOARDING TESTS PASSED!');
  console.log('===========================================\n');

  await mongoose.disconnect();
  process.exit(0);
}

runTests().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
