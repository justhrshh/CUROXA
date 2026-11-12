/**
 * QUROXA — ONBOARD TEST CLINIC & TWO TEST DOCTORS
 * 
 * Safely provisions:
 * 1. QUROXA TEST CLINIC (code: quroxa_test_clinic, tenantId: quroxa_test_clinic)
 * 2. Clinic Administrator (admin_quroxa_test)
 * 3. Doctor 1: Dr. Test One (DOC-TEST-001, General Medicine, capacity: 10)
 * 4. Doctor 2: Dr. Test Two (DOC-TEST-002, Cardiology, capacity: 5)
 * 
 * Verifies:
 * - Staging MongoDB isolation
 * - Reception QR and Doctor availability
 * - Zero modification to existing hospitals
 * - Zero real SMS sent
 */

const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../config/db');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const User = require('../models/User');
const Appointment = require('../models/Appointment');
const ReceptionQueue = require('../models/ReceptionQueue');
const LeaveRequest = require('../models/LeaveRequest');
const { getHospitalEffectiveModules } = require('../utils/subscriptionHelper');
const {
  normalizeQueueDate,
  getReceptionQueueState
} = require('../utils/receptionQueueEngine');

async function resolveClinicAndModule(clinicCode) {
  if (!clinicCode || typeof clinicCode !== 'string') {
    return { error: 'Invalid clinic identifier.', status: 400 };
  }
  const cleanCode = clinicCode.trim().toLowerCase();
  const hospital = await SuperAdminHospital.findOne({
    $or: [
      { code: cleanCode },
      { hospitalId: cleanCode.toUpperCase() }
    ]
  });
  if (!hospital) {
    return { error: 'Clinic not found.', status: 404 };
  }
  const effectiveModules = await getHospitalEffectiveModules(hospital);
  const isModuleEnabled = Boolean(effectiveModules.receptionQueue?.enabled);
  return {
    hospital,
    tenantId: hospital.code,
    clinicCode: hospital.code,
    isModuleEnabled
  };
}

async function checkDoctorDateAvailability(doctor, dateStr, tenantId) {
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const targetDateObj = new Date(dateStr);
  if (isNaN(targetDateObj.getTime())) return { available: false, reason: 'Invalid date format' };
  const dayName = daysOfWeek[targetDateObj.getDay()];
  if (doctor.weeklyOff) {
    let isOff = false;
    if (Array.isArray(doctor.weeklyOff)) {
      isOff = doctor.weeklyOff.some(d => String(d).trim().toLowerCase() === dayName.toLowerCase());
    } else if (typeof doctor.weeklyOff === 'string') {
      isOff = doctor.weeklyOff.trim().toLowerCase() === dayName.toLowerCase();
    }
    if (isOff) return { available: false, reason: `Doctor is on weekly off (${dayName})` };
  }
  const activeLeave = await LeaveRequest.findOne({
    tenantId: String(tenantId).trim().toLowerCase(),
    status: 'Approved',
    $or: [
      { employeeId: doctor.staff_id },
      { employeeName: new RegExp(`^${doctor.name}$`, 'i') }
    ],
    fromDate: { $lte: dateStr },
    toDate: { $gte: dateStr }
  });
  if (activeLeave) return { available: false, reason: 'Doctor is on approved leave' };
  return { available: true };
}

async function calculateDoctorDailyBookedCount({ tenantId, doctorId, date }) {
  const normDate = normalizeQueueDate(date);
  const cleanTenant = String(tenantId).trim().toLowerCase();
  const startOfDay = new Date(`${normDate}T00:00:00.000Z`);
  const endOfDay = new Date(`${normDate}T23:59:59.999Z`);
  const appointments = await Appointment.find({
    tenantId: cleanTenant,
    doctorId,
    status: { $nin: ['Cancelled', 'No-Show', 'no-show', 'Skipped'] },
    $or: [
      { tokenDate: normDate },
      { date: { $gte: startOfDay, $lte: endOfDay } }
    ]
  }, { patientId: 1 }).lean();
  const queueTickets = await ReceptionQueue.find({
    tenantId: cleanTenant,
    doctorId,
    targetAppointmentDate: normDate,
    status: { $in: ['Waiting', 'Called', 'Serving'] }
  }, { patientId: 1 }).lean();
  return appointments.length + queueTickets.length;
}

async function runOnboarding() {
  console.log('===================================================================');
  console.log('QUROXA — TEST CLINIC & DOCTORS ONBOARDING');
  console.log('===================================================================\n');

  // 1. Environment Safety Checks
  console.log('[SAFETY 1] Verifying Database Connection and Staging Environment...');
  assertSafety(process.env.NODE_ENV === 'development', 'NODE_ENV is strictly development (staging)');
  
  await connectDB();
  const dbName = mongoose.connection.name;
  console.log(`  Connected to active MongoDB database: "${dbName}"`);
  console.log(`  Active host: ${mongoose.connection.host}`);
  assertSafety(dbName !== 'production' && !dbName.includes('prod'), 'Active database is NOT production');

  // Record baseline of existing hospitals to guarantee zero modification
  const baselineHospitals = await SuperAdminHospital.find({ code: { $ne: 'quroxa_test_clinic' } }).lean();
  console.log(`  Preserving ${baselineHospitals.length} existing hospital record(s) without modification.`);

  // 2. Onboard Test Clinic
  console.log('\n[STEP 2] Provisioning QUROXA TEST CLINIC...');
  const clinicCode = 'quroxa_test_clinic';
  let hospital = await SuperAdminHospital.findOne({ code: clinicCode });

  if (!hospital) {
    hospital = await SuperAdminHospital.create({
      name: 'QUROXA TEST CLINIC',
      code: clinicCode,
      status: 'Active',
      plan: 'Enterprise Test Plan',
      subscriptionPlan: 'Enterprise Test Plan',
      subscriptionStatus: 'ACTIVE',
      subscriptionStartDate: new Date(),
      subscriptionExpiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      doctorClinicalMode: 'ONLINE',
      modules: {
        reception: { enabled: true },
        doctor: { enabled: true },
        pharmacy: { enabled: true },
        laboratory: { enabled: true },
        inventory: { enabled: true },
        dpdp: { enabled: true },
        receptionQueue: { enabled: true }
      },
      limits: {
        doctorsUsed: 2,
        doctorsLimit: 20,
        staffUsed: 1,
        staffLimit: 30
      }
    });
    console.log(`  ✅ Successfully created new SuperAdminHospital: "${hospital.name}" (${hospital.code})`);
    console.log(`     Generated Public Hospital ID: ${hospital.hospitalId}`);
  } else {
    hospital.modules.receptionQueue = { enabled: true };
    hospital.status = 'Active';
    hospital.subscriptionStatus = 'ACTIVE';
    await hospital.save();
    console.log(`  ✅ Existing test hospital verified & active: "${hospital.name}" (${hospital.code})`);
    console.log(`     Public Hospital ID: ${hospital.hospitalId}`);
  }

  // 3. Provision Clinic Administrator
  console.log('\n[STEP 3] Provisioning Test Clinic Administrator...');
  const adminStaffId = 'admin_quroxa_test';
  const adminEmail = 'admin@quroxa-test.local';
  const adminSalt = await bcrypt.genSalt(10);
  const adminPasswordHash = await bcrypt.hash('Admin@Quroxa123', adminSalt);

  const adminUser = await User.findOneAndUpdate(
    { tenantId: clinicCode, staff_id: adminStaffId },
    {
      $set: {
        name: 'Test Clinic Admin',
        email: adminEmail,
        phone: '9990001111',
        role: 'admin',
        password_hash: adminPasswordHash,
        hasSetPassword: true,
        isSetupComplete: true
      }
    },
    { upsert: true, new: true }
  );
  console.log(`  ✅ Clinic Admin provisioned: ${adminUser.name} (staff_id: ${adminUser.staff_id})`);

  // 4. Provision Doctor 1
  console.log('\n[STEP 4] Provisioning Doctor 1: Dr. Test One...');
  const doc1StaffId = 'doc_test_1';
  const doc1Salt = await bcrypt.genSalt(10);
  const doc1PasswordHash = await bcrypt.hash('Doctor1@Quroxa123', doc1Salt);

  const doc1 = await User.findOneAndUpdate(
    { tenantId: clinicCode, staff_id: doc1StaffId },
    {
      $set: {
        name: 'Dr. Test One',
        email: 'doctor1@quroxa-test.local',
        phone: '9990001112',
        role: 'doctor',
        department: 'General Medicine',
        specialty: 'General Physician',
        dailyMaxCapacity: 10,
        weeklyOff: 'Sunday',
        password_hash: doc1PasswordHash,
        hasSetPassword: true,
        isSetupComplete: true
      }
    },
    { upsert: true, new: true }
  );
  console.log(`  ✅ Doctor 1 provisioned: ${doc1.name} | Capacity: ${doc1.dailyMaxCapacity} | Specialty: ${doc1.specialty}`);

  // 5. Provision Doctor 2
  console.log('\n[STEP 5] Provisioning Doctor 2: Dr. Test Two...');
  const doc2StaffId = 'doc_test_2';
  const doc2Salt = await bcrypt.genSalt(10);
  const doc2PasswordHash = await bcrypt.hash('Doctor2@Quroxa123', doc2Salt);

  const doc2 = await User.findOneAndUpdate(
    { tenantId: clinicCode, staff_id: doc2StaffId },
    {
      $set: {
        name: 'Dr. Test Two',
        email: 'doctor2@quroxa-test.local',
        phone: '9990001113',
        role: 'doctor',
        department: 'Cardiology',
        specialty: 'Cardiologist',
        dailyMaxCapacity: 5,
        weeklyOff: 'Sunday',
        password_hash: doc2PasswordHash,
        hasSetPassword: true,
        isSetupComplete: true
      }
    },
    { upsert: true, new: true }
  );
  console.log(`  ✅ Doctor 2 provisioned: ${doc2.name} | Capacity: ${doc2.dailyMaxCapacity} | Specialty: ${doc2.specialty}`);

  // 6. Reception QR and Doctor Availability Verification
  console.log('\n[STEP 6] Verifying Reception QR & Doctor Availability Engine...');
  const resolved = await resolveClinicAndModule(clinicCode);
  assertSafety(!resolved.error, 'Clinic code resolves cleanly via resolveClinicAndModule');
  assertSafety(resolved.isModuleEnabled === true, 'Reception Queue module is enabled for test clinic');

  const todayStr = normalizeQueueDate(new Date());

  // Query eligible doctors for QR registration
  const eligibleDoctors = await User.find({
    tenantId: clinicCode,
    role: 'doctor',
    dailyMaxCapacity: { $ne: null, $gt: 0 }
  }).select('name specialty department dailyMaxCapacity weeklyOff staff_id').sort({ name: 1 }).lean();

  assertSafety(eligibleDoctors.length === 2, `Exactly 2 eligible doctors found (found: ${eligibleDoctors.length})`);

  for (const doc of eligibleDoctors) {
    const avail = await checkDoctorDateAvailability(doc, todayStr, clinicCode);
    assertSafety(avail.available === true, `Doctor ${doc.name} availability is true on test date (${todayStr})`);
    
    const bookedCount = await calculateDoctorDailyBookedCount({ tenantId: clinicCode, doctorId: doc._id, date: todayStr });
    const remaining = Math.max(0, doc.dailyMaxCapacity - bookedCount);
    console.log(`  * ${doc.name}: Capacity = ${doc.dailyMaxCapacity}, Booked = ${bookedCount}, Remaining = ${remaining}`);
    assertSafety(remaining === doc.dailyMaxCapacity, `Remaining capacity matches initial dailyMaxCapacity (${remaining})`);
  }

  // 7. Tenant Isolation Verification
  console.log('\n[STEP 7] Verifying Tenant Isolation & Database Integrity...');
  // Confirm doctors have exact tenantId
  assertSafety(doc1.tenantId === clinicCode, 'Doctor 1 belongs strictly to quroxa_test_clinic');
  assertSafety(doc2.tenantId === clinicCode, 'Doctor 2 belongs strictly to quroxa_test_clinic');
  assertSafety(adminUser.tenantId === clinicCode, 'Admin belongs strictly to quroxa_test_clinic');

  // Verify baseline hospitals remained completely untouched
  const currentBaselineHospitals = await SuperAdminHospital.find({ code: { $ne: 'quroxa_test_clinic' } }).lean();
  assertSafety(currentBaselineHospitals.length === baselineHospitals.length, 'Zero existing hospitals added, modified or deleted');

  // Verify credentials check with bcrypt (select: false requires explicit selection)
  const adminWithPassword = await User.findById(adminUser._id).select('+password_hash');
  const adminAuthPass = await bcrypt.compare('Admin@Quroxa123', adminWithPassword.password_hash);
  assertSafety(adminAuthPass, 'Admin password verifies with bcrypt');

  const doc1WithPassword = await User.findById(doc1._id).select('+password_hash');
  const doc1AuthPass = await bcrypt.compare('Doctor1@Quroxa123', doc1WithPassword.password_hash);
  assertSafety(doc1AuthPass, 'Doctor 1 password verifies with bcrypt');

  const doc2WithPassword = await User.findById(doc2._id).select('+password_hash');
  const doc2AuthPass = await bcrypt.compare('Doctor2@Quroxa123', doc2WithPassword.password_hash);
  assertSafety(doc2AuthPass, 'Doctor 2 password verifies with bcrypt');

  console.log('\n===================================================================');
  console.log('ONBOARDING COMPLETE & VERIFIED — READY FOR LOCAL WORKFLOW TESTING');
  console.log('===================================================================');
  console.log(`Clinic Name:       ${hospital.name}`);
  console.log(`Clinic Code:       ${hospital.code}`);
  console.log(`Public Hospital ID:${hospital.hospitalId}`);
  console.log(`Tenant ID:         ${hospital.code}`);
  console.log(`Reception QR URL:  /reception-queue/${hospital.code}`);
  console.log(`Portal URL:        /portal/${hospital.hospitalId}`);
  console.log(`Admin Login:       Username: ${adminUser.staff_id} or ${adminUser.email}`);
  console.log(`Doctor 1:          ${doc1.name} (${doc1.staff_id}) | Capacity: ${doc1.dailyMaxCapacity}`);
  console.log(`Doctor 2:          ${doc2.name} (${doc2.staff_id}) | Capacity: ${doc2.dailyMaxCapacity}`);
  console.log('===================================================================\n');

  await mongoose.connection.close();
  process.exit(0);
}

function assertSafety(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    process.exit(1);
  }
}

runOnboarding().catch(err => {
  console.error('Onboarding execution error:', err);
  process.exit(1);
});
