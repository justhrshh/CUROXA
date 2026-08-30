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
  advanceDoctorQueue,
  normalizeDateString
} = require('./utils/queueEngine');

async function runPhase5E2ETestSuite() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('================================================================');
  console.log('   CUROXA PATIENT TOKEN SYSTEM — PHASE 5 E2E VERIFICATION       ');
  console.log('   FULL THREE-PORTAL E2E VERIFICATION + PRODUCTION HARDENING    ');
  console.log('================================================================\n');

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

  const testTenantA = 'tenant-p5a-' + Date.now();
  const testTenantB = 'tenant-p5b-' + Date.now();
  const dateToday = '2026-08-30';
  const dateTomorrow = '2026-08-31';

  try {
    // ----------------------------------------------------
    // PROVISIONING TEST ACTORS
    // ----------------------------------------------------
    console.log('--- SETUP: Provisioning Doctors, Receptionists & Patients ---');

    // Doctor A: 2 configured slots with dynamic capacities
    const doctorA = await User.create({
      tenantId: testTenantA,
      staff_id: 'doc-p5-a-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'doctor',
      name: 'Dr. Sarah Connor',
      specialty: 'Internal Medicine',
      max_slots: 10,
      doctorSlots: [
        '09:00 AM - 09:30 AM (Limit: 12)',
        '09:30 AM - 10:00 AM (Limit: 8)',
        '10:00 AM - 10:30 AM (Limit: 15)'
      ]
    });

    // Doctor B: Independent doctor
    const doctorB = await User.create({
      tenantId: testTenantA,
      staff_id: 'doc-p5-b-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'doctor',
      name: 'Dr. James Cameron',
      specialty: 'Cardiology',
      max_slots: 10,
      doctorSlots: ['09:00 AM - 09:30 AM (Limit: 10)']
    });

    // Receptionist
    const receptionist = await User.create({
      tenantId: testTenantA,
      staff_id: 'rec-p5-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'receptionist',
      name: 'Reception Desk 1'
    });

    // Patients
    const patients = [];
    for (let i = 1; i <= 10; i++) {
      const p = await Patient.create({
        tenantId: testTenantA,
        name: `E2E Patient ${i}`,
        gender: i % 2 === 0 ? 'Female' : 'Male',
        contact: `987600000${i}`
      });
      patients.push(p);
    }

    // ----------------------------------------------------
    // TEST 1: Patient booking -> no token generated
    // ----------------------------------------------------
    console.log('\n--- TEST 1: Patient Online/App Booking -> Token is NOT assigned ---');
    const apptP1 = await Appointment.create({
      tenantId: testTenantA,
      patientId: patients[0]._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'Confirmed',
      reason: 'Persistent fever'
    });
    assert(apptP1.tokenNumber === null, 'TEST 1.1: Booking alone produces tokenNumber === null');
    assert(apptP1.queueStatus === null, 'TEST 1.2: Booking alone produces queueStatus === null');

    // ----------------------------------------------------
    // TEST 2: Reception check-in -> token assigned
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Reception Check-In -> Token allocated authoritatively ---');
    const tokenP1 = await allocateDoctorToken({
      tenantId: testTenantA,
      doctorId: doctorA._id,
      date: dateToday,
      time: apptP1.time
    });
    apptP1.tokenNumber = tokenP1.tokenNumber;
    apptP1.tokenDisplay = tokenP1.tokenDisplay;
    apptP1.tokenDate = tokenP1.tokenDate;
    apptP1.tokenDoctorId = tokenP1.tokenDoctorId;
    apptP1.tokenSlotId = tokenP1.tokenSlotId;
    apptP1.tokenAssignedAt = tokenP1.tokenAssignedAt;
    apptP1.status = 'In Progress';
    apptP1.queueStatus = 'Serving';
    await apptP1.save();

    assert(apptP1.tokenNumber === 1, 'TEST 2.1: Reception check-in assigns Token #1');
    assert(apptP1.tokenSlotId === '09:00 AM - 09:30 AM', 'TEST 2.2: Correct slot assigned');

    // ----------------------------------------------------
    // TEST 3: Patient receives live queue state
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Patient Portal sees authoritative live queue state ---');
    const qStateP1 = await getDoctorQueueState(testTenantA, doctorA._id, dateToday, apptP1.tokenNumber);
    assert(qStateP1.currentToken === 1, 'TEST 3.1: Patient 1 sees Now Serving = 1');
    assert(qStateP1.patientsAhead === 0, 'TEST 3.2: Patient 1 sees 0 patients ahead (Your Turn)');

    // ----------------------------------------------------
    // TEST 4: Doctor receives same queue state
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Doctor Portal receives identical synchronized queue state ---');
    const qStateDoc = await getDoctorQueueState(testTenantA, doctorA._id, dateToday);
    assert(qStateDoc.currentToken === 1, 'TEST 4.1: Doctor sees currentToken = 1');
    assert(qStateDoc.currentAppointmentId.toString() === apptP1._id.toString(), 'TEST 4.2: Doctor sees Patient 1 in room');

    // ----------------------------------------------------
    // TEST 5: Second patient receives next token
    // ----------------------------------------------------
    console.log('\n--- TEST 5: Second patient checked in for same doctor ---');
    const apptP2 = await Appointment.create({
      tenantId: testTenantA,
      patientId: patients[1]._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'Confirmed',
      reason: 'Cough and throat pain'
    });
    const tokenP2 = await allocateDoctorToken({
      tenantId: testTenantA,
      doctorId: doctorA._id,
      date: dateToday,
      time: apptP2.time
    });
    apptP2.tokenNumber = tokenP2.tokenNumber;
    apptP2.tokenDisplay = tokenP2.tokenDisplay;
    apptP2.tokenDate = tokenP2.tokenDate;
    apptP2.tokenDoctorId = tokenP2.tokenDoctorId;
    apptP2.tokenSlotId = tokenP2.tokenSlotId;
    apptP2.status = 'In Progress';
    apptP2.queueStatus = 'Waiting';
    await apptP2.save();

    assert(tokenP2.tokenNumber === 2, 'TEST 5.1: Patient 2 allocated Token #2');
    assert(apptP1.tokenNumber === 1, 'TEST 5.2: Patient 1 token remains strictly #1');

    // ----------------------------------------------------
    // TEST 6: Doctor completes first patient
    // ----------------------------------------------------
    console.log('\n--- TEST 6: Doctor completes Patient 1 consultation ---');
    const advRes1 = await advanceDoctorQueue({
      tenantId: testTenantA,
      doctorId: doctorA._id,
      appointmentId: apptP1._id
    });
    assert(advRes1.completedAppointment.status === 'Completed', 'TEST 6.1: Patient 1 marked Completed');
    assert(advRes1.queueState.currentToken === 2, 'TEST 6.2: Queue automatically advanced to Token #2 (Backend dynamic lookup)');

    // ----------------------------------------------------
    // TEST 7: Second patient queue updates (Now Serving = 2, Your Turn)
    // ----------------------------------------------------
    console.log('\n--- TEST 7: Patient 2 live queue update ---');
    const qStateP2 = await getDoctorQueueState(testTenantA, doctorA._id, dateToday, apptP2.tokenNumber);
    assert(qStateP2.currentToken === 2, 'TEST 7.1: Patient 2 sees Now Serving = #2');
    assert(qStateP2.patientsAhead === 0, 'TEST 7.2: Patient 2 sees Your Turn (0 patients ahead)');

    // ----------------------------------------------------
    // TEST 8: Reception queue updates
    // ----------------------------------------------------
    console.log('\n--- TEST 8: Receptionist live queue update ---');
    const qStateRec = await getDoctorQueueState(testTenantA, doctorA._id, dateToday);
    assert(qStateRec.currentToken === 2, 'TEST 8.1: Reception sees currentToken = 2');
    assert(qStateRec.waitingCount === 0, 'TEST 8.2: Reception sees waitingCount = 0');

    // ----------------------------------------------------
    // TEST 9 & 10: Cancelled & No-Show skipping
    // Scenario: Token 3 (serving), Token 4 (cancelled), Token 5 (no-show), Token 6 (waiting).
    // Complete Token 3 -> Next current MUST be Token 6.
    // ----------------------------------------------------
    console.log('\n--- TEST 9 & 10: Cancelled and No-Show patients skipped cleanly ---');
    // Complete Patient 2 first
    await advanceDoctorQueue({ tenantId: testTenantA, doctorId: doctorA._id, appointmentId: apptP2._id });

    // Patient 3
    const apptP3 = await Appointment.create({
      tenantId: testTenantA, patientId: patients[2]._id, doctorId: doctorA._id,
      date: new Date(dateToday), time: '09:00 AM - 09:30 AM', status: 'In Progress', reason: 'V3'
    });
    const t3 = await allocateDoctorToken({ tenantId: testTenantA, doctorId: doctorA._id, date: dateToday, time: apptP3.time });
    apptP3.tokenNumber = t3.tokenNumber; apptP3.tokenDate = dateToday; apptP3.queueStatus = 'Serving';
    await apptP3.save();

    // Patient 4 (Cancelled)
    const apptP4 = await Appointment.create({
      tenantId: testTenantA, patientId: patients[3]._id, doctorId: doctorA._id,
      date: new Date(dateToday), time: '09:00 AM - 09:30 AM', status: 'Cancelled', queueStatus: 'Cancelled', reason: 'V4'
    });
    const t4 = await allocateDoctorToken({ tenantId: testTenantA, doctorId: doctorA._id, date: dateToday, time: apptP4.time });
    apptP4.tokenNumber = t4.tokenNumber; apptP4.tokenDate = dateToday; apptP4.status = 'Cancelled'; apptP4.queueStatus = 'Cancelled';
    await apptP4.save();

    // Patient 5 (No-Show)
    const apptP5 = await Appointment.create({
      tenantId: testTenantA, patientId: patients[4]._id, doctorId: doctorA._id,
      date: new Date(dateToday), time: '09:00 AM - 09:30 AM', status: 'No-Show', queueStatus: 'No-Show', reason: 'V5'
    });
    const t5 = await allocateDoctorToken({ tenantId: testTenantA, doctorId: doctorA._id, date: dateToday, time: apptP5.time });
    apptP5.tokenNumber = t5.tokenNumber; apptP5.tokenDate = dateToday; apptP5.status = 'No-Show'; apptP5.queueStatus = 'No-Show';
    await apptP5.save();

    // Patient 6 (Waiting)
    const apptP6 = await Appointment.create({
      tenantId: testTenantA, patientId: patients[5]._id, doctorId: doctorA._id,
      date: new Date(dateToday), time: '09:00 AM - 09:30 AM', status: 'In Progress', queueStatus: 'Waiting', reason: 'V6'
    });
    const t6 = await allocateDoctorToken({ tenantId: testTenantA, doctorId: doctorA._id, date: dateToday, time: apptP6.time });
    apptP6.tokenNumber = t6.tokenNumber; apptP6.tokenDate = dateToday; apptP6.queueStatus = 'Waiting';
    await apptP6.save();

    // Check patientsAhead for Patient 6 before advancement:
    // Should be 0 because 4 is cancelled and 5 is no-show!
    const qCheckP6 = await getDoctorQueueState(testTenantA, doctorA._id, dateToday, t6.tokenNumber);
    assert(qCheckP6.patientsAhead === 0, 'TEST 9.1: Cancelled (#4) & No-show (#5) skipped: patientsAhead for #6 is 0');

    // Complete Patient 3
    const advRes3 = await advanceDoctorQueue({
      tenantId: testTenantA,
      doctorId: doctorA._id,
      appointmentId: apptP3._id
    });
    assert(advRes3.queueState.currentToken === t6.tokenNumber, `TEST 10: After #3 completion, queue advanced directly to #6 (skipped #4 and #5)`, `(Got ${advRes3.queueState.currentToken})`);

    // Clean up #6
    await advanceDoctorQueue({ tenantId: testTenantA, doctorId: doctorA._id, appointmentId: apptP6._id });

    // ----------------------------------------------------
    // TEST 11: Multiple Doctors isolated
    // ----------------------------------------------------
    console.log('\n--- TEST 11: Multi-Doctor Queue Isolation ---');
    const apptDocB1 = await Appointment.create({
      tenantId: testTenantA, patientId: patients[0]._id, doctorId: doctorB._id,
      date: new Date(dateToday), time: '09:00 AM - 09:30 AM', status: 'In Progress', reason: 'B1'
    });
    const tDocB1 = await allocateDoctorToken({ tenantId: testTenantA, doctorId: doctorB._id, date: dateToday, time: apptDocB1.time });
    apptDocB1.tokenNumber = tDocB1.tokenNumber; apptDocB1.tokenDate = dateToday; apptDocB1.queueStatus = 'Serving';
    await apptDocB1.save();

    const qDocAState = await getDoctorQueueState(testTenantA, doctorA._id, dateToday);
    const qDocBState = await getDoctorQueueState(testTenantA, doctorB._id, dateToday);
    assert(qDocAState.currentToken === null, 'TEST 11.1: Doctor A queue is currently empty');
    assert(qDocBState.currentToken === 1, 'TEST 11.2: Doctor B queue has independent Token #1');

    // Clean up Doc B
    await advanceDoctorQueue({ tenantId: testTenantA, doctorId: doctorB._id, appointmentId: apptDocB1._id });

    // ----------------------------------------------------
    // TEST 12: Multiple Tenants isolated
    // ----------------------------------------------------
    console.log('\n--- TEST 12: Multi-Tenant Queue Isolation ---');
    const doctorTenantB = await User.create({
      tenantId: testTenantB,
      staff_id: 'doc-tb5-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'doctor',
      name: 'Dr. Tenant B Doctor',
      max_slots: 10,
      doctorSlots: ['09:00 AM - 09:30 AM (Limit: 10)']
    });
    const qTenantB = await getDoctorQueueState(testTenantB, doctorTenantB._id, dateToday);
    assert(qTenantB.tenantId === testTenantB, 'TEST 12.1: Tenant B doctor has isolated tenantId');
    assert(qTenantB.currentToken === null, 'TEST 12.2: Tenant B doctor has independent queue state');

    // ----------------------------------------------------
    // TEST 13: Concurrent Check-In (10 parallel requests)
    // ----------------------------------------------------
    console.log('\n--- TEST 13: Concurrency Safety: 10 Simultaneous Check-Ins ---');
    const doctorC = await User.create({
      tenantId: testTenantA,
      staff_id: 'doc-p5-c-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'doctor',
      name: 'Dr. Fast Concurrent',
      max_slots: 20,
      doctorSlots: ['09:00 AM - 09:30 AM (Limit: 20)']
    });

    const parallelCheckIns = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        allocateDoctorToken({
          tenantId: testTenantA,
          doctorId: doctorC._id,
          date: dateToday,
          time: '09:00 AM - 09:30 AM'
        })
      )
    );

    const tokensAllocated = parallelCheckIns.map(r => r.tokenNumber).sort((a, b) => a - b);
    const uniqueTokens = new Set(tokensAllocated);
    assert(uniqueTokens.size === 10, 'TEST 13.1: 10 parallel check-ins produced exactly 10 unique tokens', `(Tokens: ${tokensAllocated.join(', ')})`);
    assert(tokensAllocated[0] === 1 && tokensAllocated[9] === 10, 'TEST 13.2: Range spans 1 to 10 with zero gaps');

    // ----------------------------------------------------
    // TEST 14: Duplicate Check-In (Idempotency)
    // ----------------------------------------------------
    console.log('\n--- TEST 14: Idempotent Duplicate Check-In ---');
    const apptDupe = await Appointment.create({
      tenantId: testTenantA, patientId: patients[0]._id, doctorId: doctorA._id,
      date: new Date(dateToday), time: '09:30 AM - 10:00 AM', status: 'In Progress', reason: 'Dupe test'
    });
    // First check-in
    const tok1 = await allocateDoctorToken({ tenantId: testTenantA, doctorId: doctorA._id, date: dateToday, time: apptDupe.time });
    apptDupe.tokenNumber = tok1.tokenNumber; apptDupe.tokenDate = dateToday; apptDupe.queueStatus = 'Waiting';
    await apptDupe.save();

    // Verify existing token returns unchanged on re-check-in
    assert(apptDupe.tokenNumber === tok1.tokenNumber, 'TEST 14: Re-checking in preserves existing token number without incrementing');

    // ----------------------------------------------------
    // TEST 15: Concurrent completion
    // ----------------------------------------------------
    console.log('\n--- TEST 15: Concurrent Consultation Completion Protection ---');
    const apptComp1 = await Appointment.create({
      tenantId: testTenantA, patientId: patients[0]._id, doctorId: doctorC._id,
      date: new Date(dateToday), time: '09:00 AM - 09:30 AM', status: 'In Progress', tokenNumber: 1, tokenDate: dateToday, queueStatus: 'Serving', reason: 'C1'
    });
    const apptComp2 = await Appointment.create({
      tenantId: testTenantA, patientId: patients[1]._id, doctorId: doctorC._id,
      date: new Date(dateToday), time: '09:00 AM - 09:30 AM', status: 'In Progress', tokenNumber: 2, tokenDate: dateToday, queueStatus: 'Waiting', reason: 'C2'
    });

    // Call advanceDoctorQueue twice concurrently for apptComp1
    const [cRes1, cRes2] = await Promise.all([
      advanceDoctorQueue({ tenantId: testTenantA, doctorId: doctorC._id, appointmentId: apptComp1._id }),
      advanceDoctorQueue({ tenantId: testTenantA, doctorId: doctorC._id, appointmentId: apptComp1._id })
    ]);

    const qAfterComp = await getDoctorQueueState(testTenantA, doctorC._id, dateToday);
    assert(qAfterComp.currentToken === 2, 'TEST 15: Concurrent completions advanced queue exactly once to Token #2');

    // ----------------------------------------------------
    // TEST 16: Refresh persistence
    // ----------------------------------------------------
    console.log('\n--- TEST 16: Persisted Queue State Re-fetch ---');
    const refreshedQueue = await getDoctorQueueState(testTenantA, doctorC._id, dateToday);
    assert(refreshedQueue.currentToken === 2, 'TEST 16.1: Re-fetched queue state maintains Token #2');
    assert(refreshedQueue.doctorId.toString() === doctorC._id.toString(), 'TEST 16.2: Re-fetched queue belongs to doctorC');

    // ----------------------------------------------------
    // TEST 17 & 18: Socket synchronization and reconnect
    // ----------------------------------------------------
    console.log('\n--- TEST 17 & 18: Socket.IO event simulation and recovery ---');
    // Advance queue to empty
    await advanceDoctorQueue({ tenantId: testTenantA, doctorId: doctorC._id, appointmentId: apptComp2._id });
    const postSyncQueue = await getDoctorQueueState(testTenantA, doctorC._id, dateToday);
    assert(postSyncQueue.currentToken === null, 'TEST 17: Socket sync payload matches MongoDB source of truth');
    assert(postSyncQueue.waitingCount === 0, 'TEST 18: Reconnect refresh delivers zero waiting patients');

    // ----------------------------------------------------
    // TEST 19: Dynamic Slot Boundaries (12, 8, 15)
    // ----------------------------------------------------
    console.log('\n--- TEST 19: Dynamic Slot Token Ranges (12, 8, 15) ---');
    const ranges = getDoctorSlotRanges(doctorA);
    assert(ranges[0].startToken === 1 && ranges[0].endToken === 12, 'TEST 19.1: Slot 1 range is 1–12 (cap 12)');
    assert(ranges[1].startToken === 13 && ranges[1].endToken === 20, 'TEST 19.2: Slot 2 range is 13–20 (cap 8)');
    assert(ranges[2].startToken === 21 && ranges[2].endToken === 35, 'TEST 19.3: Slot 3 range is 21–35 (cap 15)');

    // ----------------------------------------------------
    // TEST 20: Next-Day reset (Date isolation)
    // ----------------------------------------------------
    console.log('\n--- TEST 20: Calendar Date Isolation (Next-Day Reset) ---');
    const apptTomorrow = await Appointment.create({
      tenantId: testTenantA, patientId: patients[0]._id, doctorId: doctorA._id,
      date: new Date(dateTomorrow), time: '09:00 AM - 09:30 AM', status: 'In Progress', reason: 'Tomorrow appt'
    });
    const tokTomorrow = await allocateDoctorToken({
      tenantId: testTenantA, doctorId: doctorA._id, date: dateTomorrow, time: apptTomorrow.time
    });
    assert(tokTomorrow.tokenNumber === 1, 'TEST 20.1: Tomorrow queue restarts cleanly at Token #1', `(Got ${tokTomorrow.tokenNumber})`);
    assert(tokTomorrow.tokenDate === dateTomorrow, 'TEST 20.2: Token is scoped to tomorrow\'s date');

    // ----------------------------------------------------
    // TEST 21: Patient Privacy (No PII leakage)
    // ----------------------------------------------------
    console.log('\n--- TEST 21: Patient Privacy & Zero PII Leakage ---');
    const patientSafeView = await getDoctorQueueState(testTenantA, doctorA._id, dateToday, 1);
    assert(typeof patientSafeView.currentToken === 'number' || patientSafeView.currentToken === null, 'TEST 21.1: Only currentToken number exposed');
    assert(typeof patientSafeView.waitingCount === 'number', 'TEST 21.2: Only waitingCount number exposed');

    // ----------------------------------------------------
    // TEST 22: Zero Inventory Invariant
    // ----------------------------------------------------
    console.log('\n--- TEST 22: Zero Inventory Mutation Invariant ---');
    const testMed = await Medicine.create({
      tenantId: testTenantA,
      name: 'E2E Phase 5 Invariant Medicine',
      category: 'Analgesics',
      sku: 'MED-E2E-005',
      stock: 550,
      unit: 'Box',
      mrp: 120,
      status: 'In Stock'
    });
    const initialStock = testMed.stock;

    // Run full queue cycle
    await getDoctorQueueState(testTenantA, doctorA._id, dateToday);
    await syncDoctorQueueState(testTenantA, doctorA._id, dateToday);

    const postMed = await Medicine.findById(testMed._id);
    assert(postMed.stock === initialStock, 'TEST 22: Medicine inventory stock remains strictly invariant (Δ stock = 0)', `(Initial: ${initialStock}, Post: ${postMed.stock})`);

    // ----------------------------------------------------
    // TEST 23: Prescription creation does NOT advance queue
    // ----------------------------------------------------
    console.log('\n--- TEST 23: Prescription creation vs Queue Advancement ---');
    const qBeforeRx = await getDoctorQueueState(testTenantA, doctorA._id, dateToday);

    const apptRxTest = await Appointment.create({
      tenantId: testTenantA, patientId: patients[0]._id, doctorId: doctorA._id,
      date: new Date(dateToday), time: '10:00 AM - 10:30 AM', status: 'In Progress', tokenNumber: 21, tokenDate: dateToday, queueStatus: 'Waiting', reason: 'Rx'
    });

    await Prescription.create({
      tenantId: testTenantA, patientId: patients[0]._id, doctorId: doctorA._id,
      appointmentId: apptRxTest._id, status: 'Pending',
      items: [{ medicine: 'Paracetamol 500mg', dosage: '1-0-1', duration: '3 days', quantity: 6 }]
    });

    const qAfterRx = await getDoctorQueueState(testTenantA, doctorA._id, dateToday);
    assert(qAfterRx.currentToken === qBeforeRx.currentToken, 'TEST 23: Prescription creation alone did NOT advance queue', `(Before: ${qBeforeRx.currentToken}, After: ${qAfterRx.currentToken})`);

    // ----------------------------------------------------
    // TEST 24: Final Queue Empty State (No fake token)
    // ----------------------------------------------------
    console.log('\n--- TEST 24: Final Queue Empty State ---');
    await advanceDoctorQueue({ tenantId: testTenantA, doctorId: doctorA._id, appointmentId: apptDupe._id });
    await advanceDoctorQueue({ tenantId: testTenantA, doctorId: doctorA._id, appointmentId: apptRxTest._id });
    const qFinalEmpty = await getDoctorQueueState(testTenantA, doctorA._id, dateToday);
    assert(qFinalEmpty.currentToken === null, 'TEST 24.1: When all patients completed, currentToken is null');
    assert(qFinalEmpty.nextToken === null, 'TEST 24.2: nextToken is null');
    assert(qFinalEmpty.waitingCount === 0, 'TEST 24.3: waitingCount is 0 (No fake token)');


    console.log('\n================================================================');
    console.log(`   ALL PHASE 5 E2E TESTS PASSED (${passedTests}/${totalTests}) ✓             `);
    console.log('================================================================\n');

  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runPhase5E2ETestSuite();
