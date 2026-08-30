require('./node_modules/dotenv').config({ path: './.env' });
const mongoose = require('./node_modules/mongoose');
const User = require('./models/User');
const Patient = require('./models/Patient');
const Appointment = require('./models/Appointment');
const DoctorQueue = require('./models/DoctorQueue');
const Medicine = require('./models/Medicine');
const {
  getDoctorSlotRanges,
  allocateDoctorToken,
  getDoctorQueueState
} = require('./utils/queueEngine');

async function runPhase2TestSuite() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('====================================================');
  console.log('   PATIENT TOKEN SYSTEM — PHASE 2 TEST SUITE         ');
  console.log('   RECEPTION CHECK-IN + TOKEN INTEGRATION            ');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, testName, details = '') {
    totalTests++;
    if (condition) {
      console.log(`[PASS ✓] ${testName} ${details}`);
      passedTests++;
    } else {
      console.error(`[FAIL ✗] ${testName} ${details}`);
      throw new Error(`Assertion failed: ${testName} ${details}`);
    }
  }

  const testTenant = 'tenant-phase2-' + Date.now();
  const testTenantB = 'tenant-b-phase2-' + Date.now();
  const dateToday = '2026-08-30';

  try {
    // ----------------------------------------------------
    // SETUP: Provision Doctors & Patients
    // ----------------------------------------------------
    console.log('--- SETUP: Provisioning test doctors and patients ---');
    const doctorA = await User.create({
      tenantId: testTenant,
      staff_id: 'doc-p2-a-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'doctor',
      name: 'Dr. Sarah Wilson',
      specialty: 'Cardiology',
      max_slots: 10,
      doctorSlots: [
        '09:00 AM - 09:30 AM (Limit: 12)',
        '09:30 AM - 10:00 AM (Limit: 8)',
        '10:00 AM - 10:30 AM (Limit: 15)'
      ]
    });

    const doctorB = await User.create({
      tenantId: testTenant,
      staff_id: 'doc-p2-b-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'doctor',
      name: 'Dr. Michael Chang',
      specialty: 'Pediatrics',
      max_slots: 10,
      doctorSlots: [
        '09:00 AM - 09:30 AM (Limit: 10)',
        '09:30 AM - 10:00 AM (Limit: 10)'
      ]
    });

    const patient1 = await Patient.create({
      tenantId: testTenant,
      name: 'Emma Watson',
      gender: 'Female',
      contact: '9887766551'
    });

    const patient2 = await Patient.create({
      tenantId: testTenant,
      name: 'John Miller',
      gender: 'Male',
      contact: '9887766552'
    });

    const patient3 = await Patient.create({
      tenantId: testTenant,
      name: 'Sophia Clark',
      gender: 'Female',
      contact: '9887766553'
    });

    const patient4 = await Patient.create({
      tenantId: testTenant,
      name: 'David Lee',
      gender: 'Male',
      contact: '9887766554'
    });

    // ----------------------------------------------------
    // TEST 1: Create appointment -> tokenNumber = null
    // ----------------------------------------------------
    console.log('\n--- TEST 1: Appointment booking alone does NOT generate a token ---');
    const appt1 = await Appointment.create({
      tenantId: testTenant,
      patientId: patient1._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'Pending',
      reason: 'General checkup'
    });
    assert(appt1.tokenNumber === null, 'TEST 1.1: Newly created appointment has tokenNumber = null');
    assert(appt1.queueStatus === null, 'TEST 1.2: Newly created appointment has queueStatus = null');

    // ----------------------------------------------------
    // TEST 2: Reception Check-In -> Server allocates Token = 1
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Reception Check-in generates server-authoritative token ---');
    const tokenResult1 = await allocateDoctorToken({
      tenantId: appt1.tenantId,
      doctorId: appt1.doctorId,
      date: appt1.date,
      time: appt1.time
    });

    appt1.tokenNumber = tokenResult1.tokenNumber;
    appt1.tokenDisplay = tokenResult1.tokenDisplay;
    appt1.tokenDate = tokenResult1.tokenDate;
    appt1.tokenDoctorId = tokenResult1.tokenDoctorId;
    appt1.tokenSlotId = tokenResult1.tokenSlotId;
    appt1.tokenAssignedAt = tokenResult1.tokenAssignedAt;
    appt1.queueStatus = 'Waiting';
    appt1.status = 'In Progress';
    await appt1.save();

    const savedAppt1 = await Appointment.findById(appt1._id);
    assert(savedAppt1.tokenNumber === 1, 'TEST 2: Patient check-in allocated Token = 1', `(Got ${savedAppt1.tokenNumber})`);
    assert(savedAppt1.queueStatus === 'Waiting', 'TEST 2.1: queueStatus updated to Waiting');
    assert(savedAppt1.status === 'In Progress', 'TEST 2.2: Appointment status updated to In Progress');

    // ----------------------------------------------------
    // TEST 3: Reception UI representation
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Reception Token Display Verification ---');
    assert(savedAppt1.tokenDisplay === '1', 'TEST 3: tokenDisplay is formatted correctly as "1"');
    assert(savedAppt1.tokenSlotId === '09:00 AM - 09:30 AM', 'TEST 3.1: tokenSlotId is preserved');

    // ----------------------------------------------------
    // TEST 4: Repeated check-in -> Idempotent, returns Token = 1
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Idempotent re-check-in verification ---');
    const queueBeforeRecheck = await getDoctorQueueState(testTenant, doctorA._id, dateToday);
    const slot0CountBefore = queueBeforeRecheck.slotCounters?.get('slot_0') || queueBeforeRecheck.slotCounters?.['slot_0'] || 1;

    // Simulate check-in endpoint idempotency check
    let recheckedToken = null;
    if (savedAppt1.tokenNumber !== null) {
      recheckedToken = savedAppt1.tokenNumber;
    } else {
      const allocatedNew = await allocateDoctorToken({
        tenantId: savedAppt1.tenantId,
        doctorId: savedAppt1.doctorId,
        date: savedAppt1.date,
        time: savedAppt1.time
      });
      recheckedToken = allocatedNew.tokenNumber;
    }

    assert(recheckedToken === 1, 'TEST 4: Re-checking in returns existing Token = 1 unchanged');

    const queueAfterRecheck = await getDoctorQueueState(testTenant, doctorA._id, dateToday);
    const slot0CountAfter = queueAfterRecheck.slotCounters?.get('slot_0') || queueAfterRecheck.slotCounters?.['slot_0'] || 1;
    assert(slot0CountAfter === slot0CountBefore, 'TEST 4.1: Slot counter was NOT incremented on duplicate check-in');

    // ----------------------------------------------------
    // TEST 5: Second appointment for Doctor A -> Token = 2
    // ----------------------------------------------------
    console.log('\n--- TEST 5: Second patient check-in for Doctor A ---');
    const appt2 = await Appointment.create({
      tenantId: testTenant,
      patientId: patient2._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'Pending',
      reason: 'Follow-up'
    });

    const tokenResult2 = await allocateDoctorToken({
      tenantId: appt2.tenantId,
      doctorId: appt2.doctorId,
      date: appt2.date,
      time: appt2.time
    });

    appt2.tokenNumber = tokenResult2.tokenNumber;
    appt2.tokenDisplay = tokenResult2.tokenDisplay;
    appt2.tokenDate = tokenResult2.tokenDate;
    appt2.tokenDoctorId = tokenResult2.tokenDoctorId;
    appt2.tokenSlotId = tokenResult2.tokenSlotId;
    appt2.tokenAssignedAt = tokenResult2.tokenAssignedAt;
    appt2.queueStatus = 'Waiting';
    appt2.status = 'In Progress';
    await appt2.save();

    assert(appt2.tokenNumber === 2, 'TEST 5: Second patient check-in for Doctor A allocated Token = 2', `(Got ${appt2.tokenNumber})`);

    // ----------------------------------------------------
    // TEST 6: Patient check-in for Doctor B -> Token = 1
    // ----------------------------------------------------
    console.log('\n--- TEST 6: Independent doctor queue for Doctor B ---');
    const apptDocB = await Appointment.create({
      tenantId: testTenant,
      patientId: patient3._id,
      doctorId: doctorB._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'Pending',
      reason: 'Pediatric checkup'
    });

    const tokenResultB = await allocateDoctorToken({
      tenantId: apptDocB.tenantId,
      doctorId: apptDocB.doctorId,
      date: apptDocB.date,
      time: apptDocB.time
    });

    apptDocB.tokenNumber = tokenResultB.tokenNumber;
    apptDocB.tokenDisplay = tokenResultB.tokenDisplay;
    apptDocB.tokenDate = tokenResultB.tokenDate;
    apptDocB.tokenDoctorId = tokenResultB.tokenDoctorId;
    apptDocB.tokenSlotId = tokenResultB.tokenSlotId;
    apptDocB.tokenAssignedAt = tokenResultB.tokenAssignedAt;
    apptDocB.queueStatus = 'Waiting';
    apptDocB.status = 'In Progress';
    await apptDocB.save();

    assert(apptDocB.tokenNumber === 1, 'TEST 6: Doctor B has independent queue starting at Token = 1', `(Got ${apptDocB.tokenNumber})`);

    // ----------------------------------------------------
    // TEST 7: Check in for later slot (Slot 2) -> Token = 13
    // ----------------------------------------------------
    console.log('\n--- TEST 7: Dynamic slot token allocation for Slot 2 ---');
    const apptSlot2 = await Appointment.create({
      tenantId: testTenant,
      patientId: patient4._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:30 AM - 10:00 AM', // Slot 2
      status: 'Pending',
      reason: 'Cardiac consultation'
    });

    const tokenResultSlot2 = await allocateDoctorToken({
      tenantId: apptSlot2.tenantId,
      doctorId: apptSlot2.doctorId,
      date: apptSlot2.date,
      time: apptSlot2.time
    });

    apptSlot2.tokenNumber = tokenResultSlot2.tokenNumber;
    apptSlot2.tokenDisplay = tokenResultSlot2.tokenDisplay;
    apptSlot2.tokenDate = tokenResultSlot2.tokenDate;
    apptSlot2.tokenDoctorId = tokenResultSlot2.tokenDoctorId;
    apptSlot2.tokenSlotId = tokenResultSlot2.tokenSlotId;
    apptSlot2.tokenAssignedAt = tokenResultSlot2.tokenAssignedAt;
    apptSlot2.queueStatus = 'Waiting';
    apptSlot2.status = 'In Progress';
    await apptSlot2.save();

    assert(apptSlot2.tokenNumber === 13, 'TEST 7: Check-in in Slot 2 allocates Token = 13 (Slot 1 ends at 12)', `(Got ${apptSlot2.tokenNumber})`);

    // ----------------------------------------------------
    // TEST 8: Online booking & payment does NOT generate a token
    // ----------------------------------------------------
    console.log('\n--- TEST 8: Online booking & payment lifecycle stays token-free ---');
    const onlineAppt = await Appointment.create({
      tenantId: testTenant,
      patientId: patient1._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '10:00 AM - 10:30 AM',
      source: 'Online',
      status: 'Pending Approval',
      reason: 'Online Cardiology request'
    });

    assert(onlineAppt.tokenNumber === null, 'TEST 8.1: Online booking created with tokenNumber = null');

    // Approve online request
    onlineAppt.status = 'Approved';
    onlineAppt.paymentStatus = 'Pending';
    await onlineAppt.save();
    assert(onlineAppt.tokenNumber === null, 'TEST 8.2: Online approval keeps tokenNumber = null');

    // Patient pays online
    onlineAppt.status = 'Confirmed';
    onlineAppt.paymentStatus = 'Paid';
    await onlineAppt.save();
    assert(onlineAppt.tokenNumber === null, 'TEST 8.3: Online payment keeps tokenNumber = null');

    // ----------------------------------------------------
    // TEST 9: Zero inventory impact (Δ stock = 0)
    // ----------------------------------------------------
    console.log('\n--- TEST 9: Zero inventory impact ---');
    const medicine = await Medicine.create({
      tenantId: testTenant,
      name: 'Reception Safe Amoxicillin',
      category: 'Antibiotics',
      sku: 'MED-REC-001',
      stock: 350,
      unit: 'Box',
      mrp: 120,
      status: 'In Stock'
    });

    const stockBeforeCheckIn = medicine.stock;

    // Check in the confirmed online appointment
    const tokenResultOnline = await allocateDoctorToken({
      tenantId: onlineAppt.tenantId,
      doctorId: onlineAppt.doctorId,
      date: onlineAppt.date,
      time: onlineAppt.time
    });

    onlineAppt.tokenNumber = tokenResultOnline.tokenNumber;
    onlineAppt.tokenDisplay = tokenResultOnline.tokenDisplay;
    onlineAppt.tokenDate = tokenResultOnline.tokenDate;
    onlineAppt.tokenDoctorId = tokenResultOnline.tokenDoctorId;
    onlineAppt.tokenSlotId = tokenResultOnline.tokenSlotId;
    onlineAppt.tokenAssignedAt = tokenResultOnline.tokenAssignedAt;
    onlineAppt.queueStatus = 'Waiting';
    onlineAppt.status = 'In Progress';
    await onlineAppt.save();

    const postMedicine = await Medicine.findById(medicine._id);
    assert(postMedicine.stock === stockBeforeCheckIn, 'TEST 9: Medicine stock is completely unchanged (Δ stock = 0)', `(Before: ${stockBeforeCheckIn}, After: ${postMedicine.stock})`);
    assert(onlineAppt.tokenNumber === 21, 'TEST 9.1: Online appointment checked in Slot 3 (cap 12+8=20) allocated Token = 21', `(Got ${onlineAppt.tokenNumber})`);

    // ----------------------------------------------------
    // TEST 10: Multi-Tenant Isolation
    // ----------------------------------------------------
    console.log('\n--- TEST 10: Strict Multi-Tenant Isolation ---');
    const doctorTenantB = await User.create({
      tenantId: testTenantB,
      staff_id: 'doc-tb2-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'doctor',
      name: 'Dr. Tenant B Physician',
      max_slots: 10,
      doctorSlots: ['09:00 AM - 09:30 AM (Limit: 10)']
    });

    const apptTenantB = await Appointment.create({
      tenantId: testTenantB,
      patientId: patient1._id,
      doctorId: doctorTenantB._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'Pending',
      reason: 'Tenant B visit'
    });

    const tokenResultTenantB = await allocateDoctorToken({
      tenantId: testTenantB,
      doctorId: doctorTenantB._id,
      date: dateToday,
      time: '09:00 AM - 09:30 AM'
    });

    apptTenantB.tokenNumber = tokenResultTenantB.tokenNumber;
    apptTenantB.tokenDisplay = tokenResultTenantB.tokenDisplay;
    apptTenantB.tokenDate = tokenResultTenantB.tokenDate;
    apptTenantB.tokenDoctorId = tokenResultTenantB.tokenDoctorId;
    apptTenantB.tokenSlotId = tokenResultTenantB.tokenSlotId;
    apptTenantB.tokenAssignedAt = tokenResultTenantB.tokenAssignedAt;
    apptTenantB.queueStatus = 'Waiting';
    await apptTenantB.save();

    assert(apptTenantB.tokenNumber === 1, 'TEST 10.1: Tenant B doctor receives Token = 1 independently');

    const tenantAApps = await Appointment.find({ tenantId: testTenant });
    const tenantBApps = await Appointment.find({ tenantId: testTenantB });
    assert(!tenantAApps.some(a => a._id.toString() === apptTenantB._id.toString()), 'TEST 10.2: Tenant A cannot see Tenant B appointments');
    assert(!tenantBApps.some(a => a._id.toString() === appt1._id.toString()), 'TEST 10.3: Tenant B cannot see Tenant A appointments');

    console.log('\n====================================================');
    console.log(`   ALL PHASE 2 TESTS PASSED (${passedTests}/${totalTests}) ✓  `);
    console.log('====================================================\n');

  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runPhase2TestSuite();
