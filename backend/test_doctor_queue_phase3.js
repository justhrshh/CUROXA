require('./node_modules/dotenv').config({ path: './.env' });
const mongoose = require('./node_modules/mongoose');
const User = require('./models/User');
const Patient = require('./models/Patient');
const Appointment = require('./models/Appointment');
const DoctorQueue = require('./models/DoctorQueue');
const Medicine = require('./models/Medicine');
const Prescription = require('./models/Prescription');
const {
  getDoctorSlotRanges,
  allocateDoctorToken,
  getDoctorQueueState,
  syncDoctorQueueState,
  advanceDoctorQueue
} = require('./utils/queueEngine');

async function runPhase3TestSuite() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('====================================================');
  console.log('   PATIENT TOKEN SYSTEM — PHASE 3 TEST SUITE         ');
  console.log('   DOCTOR LIVE QUEUE + CONSULTATION ADVANCEMENT      ');
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

  const testTenant = 'tenant-p3-' + Date.now();
  const testTenantB = 'tenant-p3-b-' + Date.now();
  const dateToday = '2026-08-30';

  try {
    // ----------------------------------------------------
    // SETUP: Provision Doctors & Patients
    // ----------------------------------------------------
    console.log('--- SETUP: Provisioning Doctors & Patients ---');
    const doctorA = await User.create({
      tenantId: testTenant,
      staff_id: 'doc-p3-a-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'doctor',
      name: 'Dr. Katherine Cole',
      specialty: 'Neurology',
      max_slots: 10,
      doctorSlots: [
        '09:00 AM - 09:30 AM (Limit: 12)',
        '09:30 AM - 10:00 AM (Limit: 12)'
      ]
    });

    const doctorB = await User.create({
      tenantId: testTenant,
      staff_id: 'doc-p3-b-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'doctor',
      name: 'Dr. Robert Shaw',
      specialty: 'Dermatology',
      max_slots: 10,
      doctorSlots: ['09:00 AM - 09:30 AM (Limit: 10)']
    });

    const patients = [];
    for (let i = 1; i <= 6; i++) {
      const p = await Patient.create({
        tenantId: testTenant,
        name: `Patient ${i}`,
        gender: i % 2 === 0 ? 'Female' : 'Male',
        contact: `911223344${i}`
      });
      patients.push(p);
    }

    // ----------------------------------------------------
    // TEST 1: One checked-in patient -> Current = Token 1
    // ----------------------------------------------------
    console.log('\n--- TEST 1: Single checked-in patient enters queue ---');
    const appt1 = await Appointment.create({
      tenantId: testTenant,
      patientId: patients[0]._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Migraine consultation'
    });

    const tokenRes1 = await allocateDoctorToken({
      tenantId: testTenant,
      doctorId: doctorA._id,
      date: dateToday,
      time: appt1.time
    });

    appt1.tokenNumber = tokenRes1.tokenNumber;
    appt1.tokenDisplay = tokenRes1.tokenDisplay;
    appt1.tokenDate = tokenRes1.tokenDate;
    appt1.tokenDoctorId = tokenRes1.tokenDoctorId;
    appt1.tokenSlotId = tokenRes1.tokenSlotId;
    appt1.queueStatus = 'Serving';
    await appt1.save();

    const q1 = await getDoctorQueueState(testTenant, doctorA._id, dateToday);
    assert(q1.currentToken === 1, 'TEST 1.1: Doctor queue currentToken is 1', `(Got ${q1.currentToken})`);
    assert(q1.nextToken === null, 'TEST 1.2: nextToken is null when only 1 patient is checked in');
    assert(q1.waitingCount === 0, 'TEST 1.3: waitingCount is 0');

    // ----------------------------------------------------
    // TEST 2: Three checked-in patients: 1, 2, 3 -> Current = 1, Next = 2, Waiting = 2
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Three checked-in patients in queue ---');
    const appt2 = await Appointment.create({
      tenantId: testTenant,
      patientId: patients[1]._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Cluster headache'
    });
    const tokenRes2 = await allocateDoctorToken({
      tenantId: testTenant,
      doctorId: doctorA._id,
      date: dateToday,
      time: appt2.time
    });
    appt2.tokenNumber = tokenRes2.tokenNumber;
    appt2.tokenDisplay = tokenRes2.tokenDisplay;
    appt2.tokenDate = tokenRes2.tokenDate;
    appt2.tokenDoctorId = tokenRes2.tokenDoctorId;
    appt2.tokenSlotId = tokenRes2.tokenSlotId;
    appt2.queueStatus = 'Waiting';
    await appt2.save();

    const appt3 = await Appointment.create({
      tenantId: testTenant,
      patientId: patients[2]._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Vertigo'
    });
    const tokenRes3 = await allocateDoctorToken({
      tenantId: testTenant,
      doctorId: doctorA._id,
      date: dateToday,
      time: appt3.time
    });
    appt3.tokenNumber = tokenRes3.tokenNumber;
    appt3.tokenDisplay = tokenRes3.tokenDisplay;
    appt3.tokenDate = tokenRes3.tokenDate;
    appt3.tokenDoctorId = tokenRes3.tokenDoctorId;
    appt3.tokenSlotId = tokenRes3.tokenSlotId;
    appt3.queueStatus = 'Waiting';
    await appt3.save();

    const q2 = await getDoctorQueueState(testTenant, doctorA._id, dateToday);
    assert(q2.currentToken === 1, 'TEST 2.1: currentToken remains 1 while doctor is seeing patient 1');
    assert(q2.nextToken === 2, 'TEST 2.2: nextToken is 2', `(Got ${q2.nextToken})`);
    assert(q2.waitingCount === 2, 'TEST 2.3: waitingCount is 2 (Tokens 2 & 3)', `(Got ${q2.waitingCount})`);

    // ----------------------------------------------------
    // TEST 3: Complete Token 1 -> Current = 2, Next = 3, Waiting = 1
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Complete Token 1 consultation ---');
    const advanceRes1 = await advanceDoctorQueue({
      tenantId: testTenant,
      doctorId: doctorA._id,
      appointmentId: appt1._id
    });
    assert(advanceRes1.completedAppointment.status === 'Completed', 'TEST 3.1: Token 1 appointment marked Completed');
    assert(advanceRes1.queueState.currentToken === 2, 'TEST 3.2: currentToken advanced to 2', `(Got ${advanceRes1.queueState.currentToken})`);
    assert(advanceRes1.queueState.nextToken === 3, 'TEST 3.3: nextToken is now 3', `(Got ${advanceRes1.queueState.nextToken})`);
    assert(advanceRes1.queueState.waitingCount === 1, 'TEST 3.4: waitingCount is now 1', `(Got ${advanceRes1.queueState.waitingCount})`);

    // ----------------------------------------------------
    // TEST 4: Complete Token 2 -> Current = 3, Next = null, Waiting = 0
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Complete Token 2 consultation ---');
    const advanceRes2 = await advanceDoctorQueue({
      tenantId: testTenant,
      doctorId: doctorA._id,
      appointmentId: appt2._id
    });
    assert(advanceRes2.queueState.currentToken === 3, 'TEST 4.1: currentToken advanced to 3', `(Got ${advanceRes2.queueState.currentToken})`);
    assert(advanceRes2.queueState.nextToken === null, 'TEST 4.2: nextToken is null (no more in queue)', `(Got ${advanceRes2.queueState.nextToken})`);
    assert(advanceRes2.queueState.waitingCount === 0, 'TEST 4.3: waitingCount is 0', `(Got ${advanceRes2.queueState.waitingCount})`);

    // ----------------------------------------------------
    // TEST 5: Complete final patient (Token 3) -> Current = null, Next = null, Waiting = 0
    // ----------------------------------------------------
    console.log('\n--- TEST 5: Complete final patient in queue ---');
    const advanceRes3 = await advanceDoctorQueue({
      tenantId: testTenant,
      doctorId: doctorA._id,
      appointmentId: appt3._id
    });
    assert(advanceRes3.queueState.currentToken === null, 'TEST 5.1: currentToken is null when all patients are served', `(Got ${advanceRes3.queueState.currentToken})`);
    assert(advanceRes3.queueState.nextToken === null, 'TEST 5.2: nextToken is null (no fake token generated)');
    assert(advanceRes3.queueState.waitingCount === 0, 'TEST 5.3: waitingCount is 0');

    // ----------------------------------------------------
    // TEST 6: Cancelled token is skipped
    // Scenario: Token 4 (serving), Token 5 (cancelled), Token 6 (waiting).
    // Complete Token 4 -> Current becomes Token 6 (skipping 5).
    // ----------------------------------------------------
    console.log('\n--- TEST 6: Cancelled tokens are safely skipped ---');
    const appt4 = await Appointment.create({
      tenantId: testTenant,
      patientId: patients[3]._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Seizure review'
    });
    const t4 = await allocateDoctorToken({ tenantId: testTenant, doctorId: doctorA._id, date: dateToday, time: appt4.time });
    appt4.tokenNumber = t4.tokenNumber;
    appt4.tokenDate = dateToday;
    appt4.queueStatus = 'Serving';
    await appt4.save();

    const appt5 = await Appointment.create({
      tenantId: testTenant,
      patientId: patients[4]._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'General check'
    });
    const t5 = await allocateDoctorToken({ tenantId: testTenant, doctorId: doctorA._id, date: dateToday, time: appt5.time });
    appt5.tokenNumber = t5.tokenNumber;
    appt5.tokenDate = dateToday;
    appt5.queueStatus = 'Waiting';
    await appt5.save();

    const appt6 = await Appointment.create({
      tenantId: testTenant,
      patientId: patients[5]._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Follow-up'
    });
    const t6 = await allocateDoctorToken({ tenantId: testTenant, doctorId: doctorA._id, date: dateToday, time: appt6.time });
    appt6.tokenNumber = t6.tokenNumber;
    appt6.tokenDate = dateToday;
    appt6.queueStatus = 'Waiting';
    await appt6.save();

    // Patient 5 cancels
    appt5.status = 'Cancelled';
    appt5.queueStatus = 'Cancelled';
    await appt5.save();

    // Complete Patient 4
    const advanceRes4 = await advanceDoctorQueue({
      tenantId: testTenant,
      doctorId: doctorA._id,
      appointmentId: appt4._id
    });

    assert(advanceRes4.queueState.currentToken === t6.tokenNumber, `TEST 6: After Token ${t4.tokenNumber} completion, skipped cancelled Token ${t5.tokenNumber} -> Current is ${t6.tokenNumber}`, `(Got ${advanceRes4.queueState.currentToken})`);

    // Clean up Token 6
    await advanceDoctorQueue({ tenantId: testTenant, doctorId: doctorA._id, appointmentId: appt6._id });

    // ----------------------------------------------------
    // TEST 7: No-show token is skipped
    // Scenario: Token 7 (serving), Token 8 (no-show), Token 9 (waiting).
    // Complete Token 7 -> Current becomes Token 9 (skipping 8).
    // ----------------------------------------------------
    console.log('\n--- TEST 7: No-Show tokens are safely skipped ---');
    const appt7 = await Appointment.create({
      tenantId: testTenant,
      patientId: patients[0]._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Checkup 7'
    });
    const t7 = await allocateDoctorToken({ tenantId: testTenant, doctorId: doctorA._id, date: dateToday, time: appt7.time });
    appt7.tokenNumber = t7.tokenNumber;
    appt7.tokenDate = dateToday;
    appt7.queueStatus = 'Serving';
    await appt7.save();

    const appt8 = await Appointment.create({
      tenantId: testTenant,
      patientId: patients[1]._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Checkup 8'
    });
    const t8 = await allocateDoctorToken({ tenantId: testTenant, doctorId: doctorA._id, date: dateToday, time: appt8.time });
    appt8.tokenNumber = t8.tokenNumber;
    appt8.tokenDate = dateToday;
    appt8.queueStatus = 'Waiting';
    await appt8.save();

    const appt9 = await Appointment.create({
      tenantId: testTenant,
      patientId: patients[2]._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Checkup 9'
    });
    const t9 = await allocateDoctorToken({ tenantId: testTenant, doctorId: doctorA._id, date: dateToday, time: appt9.time });
    appt9.tokenNumber = t9.tokenNumber;
    appt9.tokenDate = dateToday;
    appt9.queueStatus = 'Waiting';
    await appt9.save();

    // Mark patient 8 as No-Show
    appt8.status = 'No-Show';
    appt8.queueStatus = 'No-Show';
    await appt8.save();

    // Complete Patient 7
    const advanceRes7 = await advanceDoctorQueue({
      tenantId: testTenant,
      doctorId: doctorA._id,
      appointmentId: appt7._id
    });

    assert(advanceRes7.queueState.currentToken === t9.tokenNumber, `TEST 7: After Token ${t7.tokenNumber} completion, skipped no-show Token ${t8.tokenNumber} -> Current is ${t9.tokenNumber}`, `(Got ${advanceRes7.queueState.currentToken})`);

    // Clean up Token 9
    await advanceDoctorQueue({ tenantId: testTenant, doctorId: doctorA._id, appointmentId: appt9._id });

    // ----------------------------------------------------
    // TEST 8: Multiple Doctors Isolation
    // Doctor A: Current = 10, Doctor B: Current = 1
    // Complete Doctor A -> Doctor B unchanged.
    // ----------------------------------------------------
    console.log('\n--- TEST 8: Multi-Doctor Queue Isolation ---');
    const apptDocA = await Appointment.create({
      tenantId: testTenant,
      patientId: patients[0]._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Doc A Patient'
    });
    const tDocA = await allocateDoctorToken({ tenantId: testTenant, doctorId: doctorA._id, date: dateToday, time: apptDocA.time });
    apptDocA.tokenNumber = tDocA.tokenNumber;
    apptDocA.tokenDate = dateToday;
    apptDocA.queueStatus = 'Serving';
    await apptDocA.save();

    const apptDocB = await Appointment.create({
      tenantId: testTenant,
      patientId: patients[1]._id,
      doctorId: doctorB._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Doc B Patient'
    });
    const tDocB = await allocateDoctorToken({ tenantId: testTenant, doctorId: doctorB._id, date: dateToday, time: apptDocB.time });
    apptDocB.tokenNumber = tDocB.tokenNumber;
    apptDocB.tokenDate = dateToday;
    apptDocB.queueStatus = 'Serving';
    await apptDocB.save();

    const qBeforeA = await getDoctorQueueState(testTenant, doctorA._id, dateToday);
    const qBeforeB = await getDoctorQueueState(testTenant, doctorB._id, dateToday);
    assert(qBeforeB.currentToken === 1, 'TEST 8.1: Doctor B currentToken is 1');

    // Complete Doctor A
    await advanceDoctorQueue({ tenantId: testTenant, doctorId: doctorA._id, appointmentId: apptDocA._id });

    const qAfterB = await getDoctorQueueState(testTenant, doctorB._id, dateToday);
    assert(qAfterB.currentToken === 1, 'TEST 8.2: Doctor B currentToken remained 1 after Doctor A consultation completion', `(Got ${qAfterB.currentToken})`);

    // Clean up Doc B
    await advanceDoctorQueue({ tenantId: testTenant, doctorId: doctorB._id, appointmentId: apptDocB._id });

    // ----------------------------------------------------
    // TEST 9: Multi-Tenant Isolation
    // ----------------------------------------------------
    console.log('\n--- TEST 9: Multi-Tenant Queue Isolation ---');
    const doctorTenantB = await User.create({
      tenantId: testTenantB,
      staff_id: 'doc-tb3-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'doctor',
      name: 'Dr. Tenant B Doctor',
      max_slots: 10,
      doctorSlots: ['09:00 AM - 09:30 AM (Limit: 10)']
    });

    const apptTB = await Appointment.create({
      tenantId: testTenantB,
      patientId: patients[0]._id,
      doctorId: doctorTenantB._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Tenant B appt'
    });
    const tTB = await allocateDoctorToken({ tenantId: testTenantB, doctorId: doctorTenantB._id, date: dateToday, time: apptTB.time });
    apptTB.tokenNumber = tTB.tokenNumber;
    apptTB.tokenDate = dateToday;
    apptTB.queueStatus = 'Serving';
    await apptTB.save();

    const qTenantB = await getDoctorQueueState(testTenantB, doctorTenantB._id, dateToday);
    assert(qTenantB.currentToken === 1, 'TEST 9.1: Tenant B doctor has independent currentToken = 1');

    const qTenantA = await getDoctorQueueState(testTenant, doctorA._id, dateToday);
    assert(qTenantA.currentToken === null, 'TEST 9.2: Tenant A queue state is completely unaffected by Tenant B');

    // ----------------------------------------------------
    // TEST 10: Concurrent completion attempts
    // Two simultaneous completion calls for the same appointment.
    // ----------------------------------------------------
    console.log('\n--- TEST 10: Concurrency Protection on Queue Advancement ---');
    const apptConc1 = await Appointment.create({
      tenantId: testTenant,
      patientId: patients[0]._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:30 AM - 10:00 AM',
      status: 'In Progress',
      reason: 'Concurrent Appt 1'
    });
    const tConc1 = await allocateDoctorToken({ tenantId: testTenant, doctorId: doctorA._id, date: dateToday, time: apptConc1.time });
    apptConc1.tokenNumber = tConc1.tokenNumber;
    apptConc1.tokenDate = dateToday;
    apptConc1.queueStatus = 'Serving';
    await apptConc1.save();

    const apptConc2 = await Appointment.create({
      tenantId: testTenant,
      patientId: patients[1]._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:30 AM - 10:00 AM',
      status: 'In Progress',
      reason: 'Concurrent Appt 2'
    });
    const tConc2 = await allocateDoctorToken({ tenantId: testTenant, doctorId: doctorA._id, date: dateToday, time: apptConc2.time });
    apptConc2.tokenNumber = tConc2.tokenNumber;
    apptConc2.tokenDate = dateToday;
    apptConc2.queueStatus = 'Waiting';
    await apptConc2.save();

    // Call advanceDoctorQueue twice simultaneously on apptConc1
    const [res1, res2] = await Promise.all([
      advanceDoctorQueue({ tenantId: testTenant, doctorId: doctorA._id, appointmentId: apptConc1._id }),
      advanceDoctorQueue({ tenantId: testTenant, doctorId: doctorA._id, appointmentId: apptConc1._id })
    ]);

    const qConcAfter = await getDoctorQueueState(testTenant, doctorA._id, dateToday);
    assert(qConcAfter.currentToken === tConc2.tokenNumber, `TEST 10: Concurrent calls advanced exactly once to Token ${tConc2.tokenNumber}`, `(Got ${qConcAfter.currentToken})`);

    // Clean up
    await advanceDoctorQueue({ tenantId: testTenant, doctorId: doctorA._id, appointmentId: apptConc2._id });

    // ----------------------------------------------------
    // TEST 11: Prescription creation alone does not advance queue
    // ----------------------------------------------------
    console.log('\n--- TEST 11: Prescription creation vs Queue Advancement ---');
    const apptRx = await Appointment.create({
      tenantId: testTenant,
      patientId: patients[0]._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Rx test appointment'
    });
    const tRx = await allocateDoctorToken({ tenantId: testTenant, doctorId: doctorA._id, date: dateToday, time: apptRx.time });
    apptRx.tokenNumber = tRx.tokenNumber;
    apptRx.tokenDate = dateToday;
    apptRx.queueStatus = 'Serving';
    await apptRx.save();

    // Create prescription without completing appointment
    const prescriptionDraft = await Prescription.create({
      tenantId: testTenant,
      patientId: patients[0]._id,
      doctorId: doctorA._id,
      appointmentId: apptRx._id,
      status: 'Pending',
      items: [{ medicine: 'Paracetamol 500mg', dosage: '1-0-1', duration: '3 days', quantity: 6 }]
    });


    const qDraft = await getDoctorQueueState(testTenant, doctorA._id, dateToday);
    assert(qDraft.currentToken === tRx.tokenNumber, 'TEST 11: Prescription draft creation did NOT advance queue (currentToken remains unchanged)');

    // ----------------------------------------------------
    // TEST 12: Zero inventory mutation during queue advancement (Δ stock = 0)
    // ----------------------------------------------------
    console.log('\n--- TEST 12: Zero Inventory Impact on Queue Advancement ---');
    const testMed = await Medicine.create({
      tenantId: testTenant,
      name: 'Safe Queue Amoxicillin',
      category: 'Antibiotics',
      sku: 'MED-Q-001',
      stock: 420,
      unit: 'Box',
      mrp: 180,
      status: 'In Stock'
    });

    const stockInitial = testMed.stock;

    // Advance queue by completing appointment
    await advanceDoctorQueue({ tenantId: testTenant, doctorId: doctorA._id, appointmentId: apptRx._id });

    const postMed = await Medicine.findById(testMed._id);
    assert(postMed.stock === stockInitial, 'TEST 12: Medicine stock is completely unchanged (Δ stock = 0)', `(Initial: ${stockInitial}, Post: ${postMed.stock})`);

    // ----------------------------------------------------
    // TEST 13: Refresh / Re-fetch Doctor Queue
    // ----------------------------------------------------
    console.log('\n--- TEST 13: Persisted Queue State Re-fetch ---');
    const fetchedQueue = await getDoctorQueueState(testTenant, doctorA._id, dateToday);
    assert(fetchedQueue.tenantId === testTenant, 'TEST 13.1: Re-fetched queue belongs to tenant');
    assert(fetchedQueue.doctorId.toString() === doctorA._id.toString(), 'TEST 13.2: Re-fetched queue belongs to doctor');
    assert(fetchedQueue.date === dateToday, 'TEST 13.3: Re-fetched queue date is preserved');

    // ----------------------------------------------------
    // TEST 14: Dynamic Slot sequence preserved during consultation
    // ----------------------------------------------------
    console.log('\n--- TEST 14: Dynamic slot token sequences in live queue ---');
    const slotRanges = getDoctorSlotRanges(doctorA);
    assert(slotRanges[0].startToken === 1 && slotRanges[0].endToken === 12, 'TEST 14.1: Slot 1 range is 1-12');
    assert(slotRanges[1].startToken === 13 && slotRanges[1].endToken === 24, 'TEST 14.2: Slot 2 range is 13-24');

    console.log('\n====================================================');
    console.log(`   ALL PHASE 3 TESTS PASSED (${passedTests}/${totalTests}) ✓  `);
    console.log('====================================================\n');

  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runPhase3TestSuite();
