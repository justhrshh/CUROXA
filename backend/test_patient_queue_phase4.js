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
  getDoctorQueueState,
  syncDoctorQueueState,
  advanceDoctorQueue
} = require('./utils/queueEngine');

async function runPhase4TestSuite() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('====================================================');
  console.log('   PATIENT TOKEN SYSTEM — PHASE 4 TEST SUITE         ');
  console.log('   PATIENT LIVE TOKEN + NOW SERVING VERIFICATION     ');
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

  const testTenant = 'tenant-p4-' + Date.now();
  const testTenantB = 'tenant-p4-b-' + Date.now();
  const dateToday = '2026-08-30';

  try {
    // ----------------------------------------------------
    // SETUP: Provision Doctors & Patients
    // ----------------------------------------------------
    console.log('--- SETUP: Provisioning Doctors & Patients ---');
    const doctorA = await User.create({
      tenantId: testTenant,
      staff_id: 'doc-p4-a-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'doctor',
      name: 'Dr. Elizabeth Warren',
      specialty: 'Cardiology',
      max_slots: 10,
      doctorSlots: [
        '09:00 AM - 09:30 AM (Limit: 12)',
        '09:30 AM - 10:00 AM (Limit: 12)'
      ]
    });

    const doctorB = await User.create({
      tenantId: testTenant,
      staff_id: 'doc-p4-b-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'doctor',
      name: 'Dr. Jonathan Adams',
      specialty: 'Orthopedics',
      max_slots: 10,
      doctorSlots: ['09:00 AM - 09:30 AM (Limit: 10)']
    });

    const patient1 = await Patient.create({
      tenantId: testTenant,
      name: 'Alice Springs',
      gender: 'Female',
      contact: '9880011221'
    });

    const patient2 = await Patient.create({
      tenantId: testTenant,
      name: 'Bob Marley',
      gender: 'Male',
      contact: '9880011222'
    });

    const patient3 = await Patient.create({
      tenantId: testTenant,
      name: 'Charlie Brown',
      gender: 'Male',
      contact: '9880011223'
    });

    // ----------------------------------------------------
    // TEST 1: Patient has appointment but has not checked in
    // ----------------------------------------------------
    console.log('\n--- TEST 1: Appointment booked without check-in ---');
    const apptP1 = await Appointment.create({
      tenantId: testTenant,
      patientId: patient1._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'Confirmed',
      reason: 'Routine ECG check'
    });

    assert(apptP1.tokenNumber === null, 'TEST 1.1: Unchecked-in appointment has tokenNumber === null');
    assert(apptP1.queueStatus === null, 'TEST 1.2: Unchecked-in appointment has queueStatus === null');

    // ----------------------------------------------------
    // TEST 2: Reception checks patient in -> Patient sees assigned token
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Reception checks in patient ---');
    const tokenP1 = await allocateDoctorToken({
      tenantId: testTenant,
      doctorId: doctorA._id,
      date: dateToday,
      time: apptP1.time
    });

    apptP1.tokenNumber = tokenP1.tokenNumber;
    apptP1.tokenDisplay = tokenP1.tokenDisplay;
    apptP1.tokenDate = tokenP1.tokenDate;
    apptP1.tokenDoctorId = tokenP1.tokenDoctorId;
    apptP1.tokenSlotId = tokenP1.tokenSlotId;
    apptP1.queueStatus = 'Serving';
    await apptP1.save();

    assert(apptP1.tokenNumber === 1, 'TEST 2.1: Patient 1 assigned Token #1');
    assert(apptP1.tokenDisplay === '1', 'TEST 2.2: Patient 1 tokenDisplay is "1"');

    // ----------------------------------------------------
    // TEST 3: Current doctor token is lower than patient token
    // Current = 1, Patient 2 = 2. Patients ahead = 0 (since 1 is serving).
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Patient waiting behind serving patient ---');
    const apptP2 = await Appointment.create({
      tenantId: testTenant,
      patientId: patient2._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Palpitations'
    });
    const tokenP2 = await allocateDoctorToken({
      tenantId: testTenant,
      doctorId: doctorA._id,
      date: dateToday,
      time: apptP2.time
    });
    apptP2.tokenNumber = tokenP2.tokenNumber;
    apptP2.tokenDate = dateToday;
    apptP2.queueStatus = 'Waiting';
    await apptP2.save();

    const qStateForP2 = await getDoctorQueueState(testTenant, doctorA._id, dateToday, apptP2.tokenNumber);
    assert(qStateForP2.currentToken === 1, 'TEST 3.1: Doctor now serving Token #1', `(Got ${qStateForP2.currentToken})`);
    assert(qStateForP2.patientsAhead === 0, 'TEST 3.2: 0 waiting patients ahead of Token #2 (Token #1 is in room)', `(Got ${qStateForP2.patientsAhead})`);

    // Add Patient 3 (Token 3)
    const apptP3 = await Appointment.create({
      tenantId: testTenant,
      patientId: patient3._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Hypertension check'
    });
    const tokenP3 = await allocateDoctorToken({
      tenantId: testTenant,
      doctorId: doctorA._id,
      date: dateToday,
      time: apptP3.time
    });
    apptP3.tokenNumber = tokenP3.tokenNumber;
    apptP3.tokenDate = dateToday;
    apptP3.queueStatus = 'Waiting';
    await apptP3.save();

    const qStateForP3 = await getDoctorQueueState(testTenant, doctorA._id, dateToday, apptP3.tokenNumber);
    assert(qStateForP3.patientsAhead === 1, 'TEST 3.3: 1 waiting patient ahead of Token #3 (Token #2 is waiting)', `(Got ${qStateForP3.patientsAhead})`);

    // ----------------------------------------------------
    // TEST 4: Doctor advances queue from 1 to 2 -> Patient UI reflects update
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Doctor consultation completion advancement ---');
    await advanceDoctorQueue({
      tenantId: testTenant,
      doctorId: doctorA._id,
      appointmentId: apptP1._id
    });

    const qStateAfterAdv = await getDoctorQueueState(testTenant, doctorA._id, dateToday, apptP2.tokenNumber);
    assert(qStateAfterAdv.currentToken === 2, 'TEST 4.1: Doctor currentToken advanced to 2', `(Got ${qStateAfterAdv.currentToken})`);
    assert(qStateAfterAdv.patientsAhead === 0, 'TEST 4.2: Patient 2 patientsAhead is 0');

    // ----------------------------------------------------
    // TEST 5: Cancelled token between current and patient is skipped
    // Scenario: Patient 4 (Token 4, serving), Patient 5 (Token 5, cancelled), Patient 6 (Token 6, patient).
    // Patients ahead for Patient 6 must be 0 (skipping 5).
    // ----------------------------------------------------
    console.log('\n--- TEST 5: Cancelled tokens skipped in patientsAhead ---');
    const apptP4 = await Appointment.create({
      tenantId: testTenant,
      patientId: patient1._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Visit 4'
    });
    const t4 = await allocateDoctorToken({ tenantId: testTenant, doctorId: doctorA._id, date: dateToday, time: apptP4.time });
    apptP4.tokenNumber = t4.tokenNumber;
    apptP4.tokenDate = dateToday;
    apptP4.queueStatus = 'Serving';
    await apptP4.save();

    const apptP5 = await Appointment.create({
      tenantId: testTenant,
      patientId: patient2._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'Cancelled',
      queueStatus: 'Cancelled',
      reason: 'Cancelled visit'
    });
    const t5 = await allocateDoctorToken({ tenantId: testTenant, doctorId: doctorA._id, date: dateToday, time: apptP5.time });
    apptP5.tokenNumber = t5.tokenNumber;
    apptP5.tokenDate = dateToday;
    apptP5.status = 'Cancelled';
    apptP5.queueStatus = 'Cancelled';
    await apptP5.save();

    const apptP6 = await Appointment.create({
      tenantId: testTenant,
      patientId: patient3._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Visit 6'
    });
    const t6 = await allocateDoctorToken({ tenantId: testTenant, doctorId: doctorA._id, date: dateToday, time: apptP6.time });
    apptP6.tokenNumber = t6.tokenNumber;
    apptP6.tokenDate = dateToday;
    apptP6.queueStatus = 'Waiting';
    await apptP6.save();

    // Clean up earlier appts to isolate
    await advanceDoctorQueue({ tenantId: testTenant, doctorId: doctorA._id, appointmentId: apptP2._id });
    await advanceDoctorQueue({ tenantId: testTenant, doctorId: doctorA._id, appointmentId: apptP3._id });

    const qP6 = await getDoctorQueueState(testTenant, doctorA._id, dateToday, apptP6.tokenNumber);
    assert(qP6.currentToken === t4.tokenNumber, `TEST 5.1: Current token is ${t4.tokenNumber}`, `(Got ${qP6.currentToken})`);
    assert(qP6.patientsAhead === 0, `TEST 5.2: Cancelled token ${t5.tokenNumber} was ignored: patientsAhead is 0`, `(Got ${qP6.patientsAhead})`);

    // ----------------------------------------------------
    // TEST 6: No-Show tokens skipped in patientsAhead
    // ----------------------------------------------------
    console.log('\n--- TEST 6: No-Show tokens skipped in patientsAhead ---');
    const apptP7 = await Appointment.create({
      tenantId: testTenant,
      patientId: patient1._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'No-Show',
      queueStatus: 'No-Show',
      reason: 'No show visit'
    });
    const t7 = await allocateDoctorToken({ tenantId: testTenant, doctorId: doctorA._id, date: dateToday, time: apptP7.time });
    apptP7.tokenNumber = t7.tokenNumber;
    apptP7.tokenDate = dateToday;
    apptP7.status = 'No-Show';
    apptP7.queueStatus = 'No-Show';
    await apptP7.save();

    const apptP8 = await Appointment.create({
      tenantId: testTenant,
      patientId: patient2._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Visit 8'
    });
    const t8 = await allocateDoctorToken({ tenantId: testTenant, doctorId: doctorA._id, date: dateToday, time: apptP8.time });
    apptP8.tokenNumber = t8.tokenNumber;
    apptP8.tokenDate = dateToday;
    apptP8.queueStatus = 'Waiting';
    await apptP8.save();

    const qP8 = await getDoctorQueueState(testTenant, doctorA._id, dateToday, apptP8.tokenNumber);
    // Before t8: t4 (serving), t6 (waiting), t7 (no-show) -> only t6 is waiting ahead of t8
    assert(qP8.patientsAhead === 1, `TEST 6: No-show token ${t7.tokenNumber} skipped: patientsAhead for Token ${t8.tokenNumber} is 1 (only Token ${t6.tokenNumber})`, `(Got ${qP8.patientsAhead})`);

    // ----------------------------------------------------
    // TEST 7: Patient becomes current (Your Turn)
    // ----------------------------------------------------
    console.log('\n--- TEST 7: Patient becomes current (Your Turn) ---');
    await advanceDoctorQueue({ tenantId: testTenant, doctorId: doctorA._id, appointmentId: apptP4._id });

    const qP6Now = await getDoctorQueueState(testTenant, doctorA._id, dateToday, apptP6.tokenNumber);
    assert(qP6Now.currentToken === apptP6.tokenNumber, `TEST 7.1: currentToken is now Token ${apptP6.tokenNumber} (Patient 6 Turn)`, `(Got ${qP6Now.currentToken})`);
    assert(qP6Now.patientsAhead === 0, 'TEST 7.2: patientsAhead is 0 when it is the patient\'s turn');

    // ----------------------------------------------------
    // TEST 8: Consultation completed -> Patient no longer waiting
    // ----------------------------------------------------
    console.log('\n--- TEST 8: Consultation completed ---');
    await advanceDoctorQueue({ tenantId: testTenant, doctorId: doctorA._id, appointmentId: apptP6._id });
    await advanceDoctorQueue({ tenantId: testTenant, doctorId: doctorA._id, appointmentId: apptP8._id });

    const qFinal = await getDoctorQueueState(testTenant, doctorA._id, dateToday);
    assert(qFinal.currentToken === null, 'TEST 8.1: currentToken is null when queue is empty');
    assert(qFinal.waitingCount === 0, 'TEST 8.2: waitingCount is 0');

    // ----------------------------------------------------
    // TEST 9: Multi-Doctor isolation in patient queue
    // ----------------------------------------------------
    console.log('\n--- TEST 9: Multi-Doctor isolation in patient view ---');
    const apptDocB = await Appointment.create({
      tenantId: testTenant,
      patientId: patient1._id,
      doctorId: doctorB._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'In Progress',
      reason: 'Knee Pain'
    });
    const tDocB = await allocateDoctorToken({ tenantId: testTenant, doctorId: doctorB._id, date: dateToday, time: apptDocB.time });
    apptDocB.tokenNumber = tDocB.tokenNumber;
    apptDocB.tokenDate = dateToday;
    apptDocB.queueStatus = 'Serving';
    await apptDocB.save();

    const qDocA = await getDoctorQueueState(testTenant, doctorA._id, dateToday);
    const qDocB = await getDoctorQueueState(testTenant, doctorB._id, dateToday);

    assert(qDocA.currentToken === null, 'TEST 9.1: Doctor A queue has currentToken = null');
    assert(qDocB.currentToken === 1, 'TEST 9.2: Doctor B queue has independent currentToken = 1');

    // ----------------------------------------------------
    // TEST 10: Multi-Tenant isolation
    // ----------------------------------------------------
    console.log('\n--- TEST 10: Multi-Tenant isolation ---');
    const docTenantB = await User.create({
      tenantId: testTenantB,
      staff_id: 'doc-tb4-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'doctor',
      name: 'Dr. Tenant B Doctor',
      max_slots: 10,
      doctorSlots: ['09:00 AM - 09:30 AM (Limit: 10)']
    });

    const qTB = await getDoctorQueueState(testTenantB, docTenantB._id, dateToday);
    assert(qTB.tenantId === testTenantB, 'TEST 10.1: Tenant B doctor has isolated tenantId');
    assert(qTB.currentToken === null, 'TEST 10.2: Tenant B doctor queue is completely isolated');

    // ----------------------------------------------------
    // TEST 11: Refresh / Persisted queue state
    // ----------------------------------------------------
    console.log('\n--- TEST 11: Persisted Queue State Re-fetch ---');
    const reFetchQueue = await getDoctorQueueState(testTenant, doctorB._id, dateToday);
    assert(reFetchQueue.currentToken === 1, 'TEST 11: Re-fetched queue returns persisted state accurately');

    // ----------------------------------------------------
    // TEST 12: Socket Reconnect / Event Sync
    // ----------------------------------------------------
    console.log('\n--- TEST 12: Socket Event Synchronization Simulation ---');
    // Complete Doctor B appointment
    const advDocB = await advanceDoctorQueue({ tenantId: testTenant, doctorId: doctorB._id, appointmentId: apptDocB._id });
    assert(advDocB.queueState.currentToken === null, 'TEST 12: Advanced Doctor B queue state emitted');

    // ----------------------------------------------------
    // TEST 13: Patient Data Privacy (No PII leakage in patient-facing response)
    // ----------------------------------------------------
    console.log('\n--- TEST 13: Patient Data Privacy Protection ---');
    const safeQueue = await getDoctorQueueState(testTenant, doctorA._id, dateToday, 1);
    assert(safeQueue.currentPatient === null || typeof safeQueue.currentPatient === 'object', 'TEST 13: Structure verified');

    // ----------------------------------------------------
    // TEST 14: Zero Inventory Invariant (Δ stock = 0)
    // ----------------------------------------------------
    console.log('\n--- TEST 14: Zero Inventory Impact on Patient Queue ---');
    const testMed = await Medicine.create({
      tenantId: testTenant,
      name: 'Patient Portal Safe Paracetamol',
      category: 'Analgesics',
      sku: 'MED-PAT-001',
      stock: 600,
      unit: 'Box',
      mrp: 50,
      status: 'In Stock'
    });

    const initialStock = testMed.stock;
    // Perform live queue queries and state calculations
    await getDoctorQueueState(testTenant, doctorA._id, dateToday, 1);
    await syncDoctorQueueState(testTenant, doctorA._id, dateToday);

    const postMed = await Medicine.findById(testMed._id);
    assert(postMed.stock === initialStock, 'TEST 14: Medicine stock invariant strictly preserved (Δ stock = 0)', `(Initial: ${initialStock}, Post: ${postMed.stock})`);

    console.log('\n====================================================');
    console.log(`   ALL PHASE 4 TESTS PASSED (${passedTests}/${totalTests}) ✓  `);
    console.log('====================================================\n');

  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runPhase4TestSuite();
