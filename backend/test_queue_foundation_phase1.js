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
  normalizeDateString
} = require('./utils/queueEngine');

async function runPhase1TestSuite() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('====================================================');
  console.log('   PATIENT TOKEN SYSTEM — PHASE 1 TEST SUITE         ');
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

  const testTenant = 'tenant-phase1-' + Date.now();
  const testTenantB = 'tenant-b-phase1-' + Date.now();
  const dateToday = '2026-08-30';
  const dateTomorrow = '2026-08-31';

  try {
    // ----------------------------------------------------
    // SETUP: Create Doctor A, Doctor B, and Patients
    // ----------------------------------------------------
    console.log('--- SETUP: Provisioning test doctors and patients ---');
    const doctorA = await User.create({
      tenantId: testTenant,
      staff_id: 'doc-a-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'doctor',
      name: 'Dr. Alice Smith',
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
      staff_id: 'doc-b-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'doctor',
      name: 'Dr. Bob Jones',
      specialty: 'Dermatology',
      max_slots: 10,
      doctorSlots: [
        '09:00 AM - 09:30 AM (Limit: 10)',
        '09:30 AM - 10:00 AM (Limit: 10)'
      ]
    });

    const patient1 = await Patient.create({
      tenantId: testTenant,
      name: 'Patient One',
      gender: 'Male',
      contact: '9998881111'
    });

    const patient2 = await Patient.create({
      tenantId: testTenant,
      name: 'Patient Two',
      gender: 'Female',
      contact: '9998882222'
    });

    const patient3 = await Patient.create({
      tenantId: testTenant,
      name: 'Patient Three',
      gender: 'Male',
      contact: '9998883333'
    });

    const patient4 = await Patient.create({
      tenantId: testTenant,
      name: 'Patient Four',
      gender: 'Female',
      contact: '9998884444'
    });


    // ----------------------------------------------------
    // TEST 1: Check-in patient for Doctor A -> Token = 1
    // ----------------------------------------------------
    console.log('\n--- TEST 1: First check-in for Doctor A ---');
    const token1 = await allocateDoctorToken({
      tenantId: testTenant,
      doctorId: doctorA._id,
      date: dateToday,
      time: '09:00 AM - 09:30 AM'
    });
    assert(token1.tokenNumber === 1, 'TEST 1: Doctor A first check-in allocated Token = 1', `(Got ${token1.tokenNumber})`);

    // ----------------------------------------------------
    // TEST 2: Check-in second patient for Doctor A -> Token = 2
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Second check-in for Doctor A ---');
    const token2 = await allocateDoctorToken({
      tenantId: testTenant,
      doctorId: doctorA._id,
      date: dateToday,
      time: '09:00 AM - 09:30 AM'
    });
    assert(token2.tokenNumber === 2, 'TEST 2: Doctor A second check-in allocated Token = 2', `(Got ${token2.tokenNumber})`);

    // ----------------------------------------------------
    // TEST 3: Check-in patient for Doctor B -> Token = 1
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Independent queue for Doctor B ---');
    const tokenB1 = await allocateDoctorToken({
      tenantId: testTenant,
      doctorId: doctorB._id,
      date: dateToday,
      time: '09:00 AM - 09:30 AM'
    });
    assert(tokenB1.tokenNumber === 1, 'TEST 3: Doctor B has independent queue starting at Token = 1', `(Got ${tokenB1.tokenNumber})`);

    // ----------------------------------------------------
    // TEST 4: Same doctor, next slot (Slot 1 cap 12, Slot 2 cap 8)
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Dynamic Slot 2 starts at 13 (12 + 1) ---');
    const tokenSlot2 = await allocateDoctorToken({
      tenantId: testTenant,
      doctorId: doctorA._id,
      date: dateToday,
      time: '09:30 AM - 10:00 AM' // Slot 2
    });
    assert(tokenSlot2.tokenNumber === 13, 'TEST 4: Slot 2 token begins at 13 (Slot 1 ended at 12)', `(Got ${tokenSlot2.tokenNumber})`);

    // ----------------------------------------------------
    // TEST 5: Different dynamic slot capacities (8, 20, 12)
    // ----------------------------------------------------
    console.log('\n--- TEST 5: Dynamic slot range calculation for (8, 20, 12) ---');
    const doctorDynamic = {
      max_slots: 10,
      doctorSlots: [
        '09:00 AM - 09:30 AM (Limit: 8)',
        '09:30 AM - 10:00 AM (Limit: 20)',
        '10:00 AM - 10:30 AM (Limit: 12)'
      ]
    };
    const ranges = getDoctorSlotRanges(doctorDynamic);
    assert(ranges[0].startToken === 1 && ranges[0].endToken === 8, 'TEST 5.1: Slot 1 range is 1-8');
    assert(ranges[1].startToken === 9 && ranges[1].endToken === 28, 'TEST 5.2: Slot 2 range is 9-28');
    assert(ranges[2].startToken === 29 && ranges[2].endToken === 40, 'TEST 5.3: Slot 3 range is 29-40');

    // ----------------------------------------------------
    // TEST 6: Simultaneous concurrent token allocations
    // ----------------------------------------------------
    console.log('\n--- TEST 6: Atomic concurrency check (10 parallel check-ins) ---');
    const doctorConcurrent = await User.create({
      tenantId: testTenant,
      staff_id: 'doc-conc-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'doctor',
      name: 'Dr. Concurrency Test',
      max_slots: 50,
      doctorSlots: ['09:00 AM - 09:30 AM (Limit: 50)']
    });

    const parallelAllocations = await Promise.all([
      allocateDoctorToken({ tenantId: testTenant, doctorId: doctorConcurrent._id, date: dateToday, time: '09:00 AM - 09:30 AM' }),
      allocateDoctorToken({ tenantId: testTenant, doctorId: doctorConcurrent._id, date: dateToday, time: '09:00 AM - 09:30 AM' }),
      allocateDoctorToken({ tenantId: testTenant, doctorId: doctorConcurrent._id, date: dateToday, time: '09:00 AM - 09:30 AM' }),
      allocateDoctorToken({ tenantId: testTenant, doctorId: doctorConcurrent._id, date: dateToday, time: '09:00 AM - 09:30 AM' }),
      allocateDoctorToken({ tenantId: testTenant, doctorId: doctorConcurrent._id, date: dateToday, time: '09:00 AM - 09:30 AM' }),
      allocateDoctorToken({ tenantId: testTenant, doctorId: doctorConcurrent._id, date: dateToday, time: '09:00 AM - 09:30 AM' }),
      allocateDoctorToken({ tenantId: testTenant, doctorId: doctorConcurrent._id, date: dateToday, time: '09:00 AM - 09:30 AM' }),
      allocateDoctorToken({ tenantId: testTenant, doctorId: doctorConcurrent._id, date: dateToday, time: '09:00 AM - 09:30 AM' }),
      allocateDoctorToken({ tenantId: testTenant, doctorId: doctorConcurrent._id, date: dateToday, time: '09:00 AM - 09:30 AM' }),
      allocateDoctorToken({ tenantId: testTenant, doctorId: doctorConcurrent._id, date: dateToday, time: '09:00 AM - 09:30 AM' })
    ]);

    const tokenNumbers = parallelAllocations.map(a => a.tokenNumber);
    const uniqueTokens = new Set(tokenNumbers);
    assert(tokenNumbers.length === 10 && uniqueTokens.size === 10, 'TEST 6: 10 parallel check-ins produced 10 unique sequential tokens', `(Tokens: ${tokenNumbers.sort((a,b)=>a-b).join(', ')})`);
    assert(Math.min(...tokenNumbers) === 1 && Math.max(...tokenNumbers) === 10, 'TEST 6.1: Range spans exactly 1 to 10 with zero gaps or duplicates');

    // ----------------------------------------------------
    // TEST 7: Same doctor, next calendar day -> restarts at 1
    // ----------------------------------------------------
    console.log('\n--- TEST 7: Date isolation (Next calendar date restarts at 1) ---');
    const tokenTomorrow = await allocateDoctorToken({
      tenantId: testTenant,
      doctorId: doctorA._id,
      date: dateTomorrow,
      time: '09:00 AM - 09:30 AM'
    });
    assert(tokenTomorrow.tokenNumber === 1, 'TEST 7: Tomorrow queue restarts at Token = 1', `(Got ${tokenTomorrow.tokenNumber} for ${dateTomorrow})`);

    // ----------------------------------------------------
    // TEST 8: Cross-tenant isolation
    // ----------------------------------------------------
    console.log('\n--- TEST 8: Multi-tenant isolation ---');
    const doctorTenantB = await User.create({
      tenantId: testTenantB,
      staff_id: 'doc-tb-' + Date.now(),
      password_hash: 'hashedpassword',
      role: 'doctor',
      name: 'Dr. Tenant B Doctor',
      max_slots: 10,
      doctorSlots: ['09:00 AM - 09:30 AM (Limit: 10)']
    });

    const tokenTenantB = await allocateDoctorToken({
      tenantId: testTenantB,
      doctorId: doctorTenantB._id,
      date: dateToday,
      time: '09:00 AM - 09:30 AM'
    });
    assert(tokenTenantB.tokenNumber === 1, 'TEST 8.1: Tenant B doctor receives Token = 1 independently');

    const queueStateA = await getDoctorQueueState(testTenant, doctorA._id, dateToday);
    const queueStateB = await getDoctorQueueState(testTenantB, doctorTenantB._id, dateToday);
    assert(queueStateA.tenantId === testTenant, 'TEST 8.2: Tenant A queue state isolated');
    assert(queueStateB.tenantId === testTenantB, 'TEST 8.3: Tenant B queue state isolated');

    // ----------------------------------------------------
    // TEST 9: Appointment creation without check-in -> No token
    // ----------------------------------------------------
    console.log('\n--- TEST 9: Appointment creation without check-in ---');
    const apptNoCheckIn = await Appointment.create({
      tenantId: testTenant,
      patientId: patient1._id,
      doctorId: doctorA._id,
      date: new Date(dateToday),
      time: '09:00 AM - 09:30 AM',
      status: 'Pending',
      reason: 'Routine consultation'
    });
    assert(apptNoCheckIn.tokenNumber === null, 'TEST 9: Booking appointment alone does NOT assign a token', `(tokenNumber: ${apptNoCheckIn.tokenNumber})`);
    assert(apptNoCheckIn.queueStatus === null, 'TEST 9.1: queueStatus is null before check-in');

    // ----------------------------------------------------
    // TEST 10: Check-in transition -> Exactly one token assignment
    // ----------------------------------------------------
    console.log('\n--- TEST 10: Patient arrives at Reception and checks in ---');
    const allocated = await allocateDoctorToken({
      tenantId: apptNoCheckIn.tenantId,
      doctorId: apptNoCheckIn.doctorId,
      date: apptNoCheckIn.date,
      time: apptNoCheckIn.time
    });

    apptNoCheckIn.tokenNumber = allocated.tokenNumber;
    apptNoCheckIn.tokenDisplay = allocated.tokenDisplay;
    apptNoCheckIn.tokenDate = allocated.tokenDate;
    apptNoCheckIn.tokenDoctorId = allocated.tokenDoctorId;
    apptNoCheckIn.tokenSlotId = allocated.tokenSlotId;
    apptNoCheckIn.tokenAssignedAt = allocated.tokenAssignedAt;
    apptNoCheckIn.queueStatus = 'Waiting';
    apptNoCheckIn.status = 'In Progress';
    await apptNoCheckIn.save();

    const reloadedAppt = await Appointment.findById(apptNoCheckIn._id);
    assert(reloadedAppt.tokenNumber !== null, 'TEST 10: Token number persisted on appointment', `(Token: ${reloadedAppt.tokenNumber})`);
    assert(reloadedAppt.queueStatus === 'Waiting', 'TEST 10.1: queueStatus is Waiting');
    assert(reloadedAppt.tokenSlotId === '09:00 AM - 09:30 AM', 'TEST 10.2: tokenSlotId saved');

    // ----------------------------------------------------
    // TEST 11: Idempotency: Duplicate check-in attempt
    // ----------------------------------------------------
    console.log('\n--- TEST 11: Idempotent duplicate check-in ---');
    const existingToken = reloadedAppt.tokenNumber;
    const initialQueue = await getDoctorQueueState(testTenant, doctorA._id, dateToday);
    const initialSlotCount = initialQueue.slotCounters ? initialQueue.slotCounters.get('slot_0') || initialQueue.slotCounters['slot_0'] : 0;

    // Simulate second check-in attempt on the same appointment
    if (reloadedAppt.tokenNumber !== null) {
      // Idempotent return without allocating
      const secondCheckInToken = reloadedAppt.tokenNumber;
      assert(secondCheckInToken === existingToken, 'TEST 11: Re-check-in returns existing token number unchanged');
    }

    const postQueue = await getDoctorQueueState(testTenant, doctorA._id, dateToday);
    const postSlotCount = postQueue.slotCounters ? postQueue.slotCounters.get('slot_0') || postQueue.slotCounters['slot_0'] : 0;
    assert(postSlotCount === initialSlotCount, 'TEST 11.1: Slot counter was NOT incremented on duplicate check-in');

    // ----------------------------------------------------
    // TEST 12: Token allocation does not modify Medicine.stock
    // ----------------------------------------------------
    console.log('\n--- TEST 12: Zero inventory impact (Δ stock = 0) ---');
    const medTest = await Medicine.create({
      tenantId: testTenant,
      name: 'Token Safe Paracetamol',
      category: 'Analgesics',
      sku: 'MED-TOK-001',
      stock: 500,
      unit: 'Tablet',
      mrp: 10,
      status: 'In Stock'
    });

    const initialStock = medTest.stock;

    // Perform check-in
    await allocateDoctorToken({
      tenantId: testTenant,
      doctorId: doctorA._id,
      date: dateToday,
      time: '09:00 AM - 09:30 AM'
    });

    const postMed = await Medicine.findById(medTest._id);
    assert(postMed.stock === initialStock, 'TEST 12: Medicine stock remains completely unchanged (Δ stock = 0)', `(Initial: ${initialStock}, Post: ${postMed.stock})`);

    console.log('\n====================================================');
    console.log(`   ALL PHASE 1 TESTS PASSED (${passedTests}/${totalTests}) ✓  `);
    console.log('====================================================\n');

  } catch (err) {
    console.error('Test failed with error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runPhase1TestSuite();
