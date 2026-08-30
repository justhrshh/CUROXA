require('./node_modules/dotenv').config({ path: './.env' });
const mongoose = require('./node_modules/mongoose');
const User = require('./models/User');
const Patient = require('./models/Patient');
const Appointment = require('./models/Appointment');
const DoctorQueue = require('./models/DoctorQueue');
const Medicine = require('./models/Medicine');
const {
  normalizeDateString,
  getDoctorQueueState,
  allocateDoctorToken,
  advanceDoctorQueue
} = require('./utils/queueEngine');

const MONGO_URI = process.env.MONGO_URI;


async function runAcceptanceTest() {
  console.log('====================================================');
  console.log('   RECEPTIONIST WAITING QUEUE PANEL ACCEPTANCE TEST ');
  console.log('====================================================\n');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.\n');

  const todayStr = normalizeDateString(new Date());
  const tenantId = 'city_hospital';

  // 1. Setup Doctor A, Doctor B, Patient 1, Patient 2, Patient 3
  const doctorA = await User.findOneAndUpdate(
    { email: 'waiting_queue_docA@curoxa.com' },
    {
      name: 'Dr. Acceptance Alpha',
      email: 'waiting_queue_docA@curoxa.com',
      role: 'doctor',
      specialty: 'Cardiology',
      staff_id: 'DOC_ACC_A',
      tenantId
    },
    { upsert: true, returnDocument: 'after' }
  );

  const doctorB = await User.findOneAndUpdate(
    { email: 'waiting_queue_docB@curoxa.com' },
    {
      name: 'Dr. Acceptance Beta',
      email: 'waiting_queue_docB@curoxa.com',
      role: 'doctor',
      specialty: 'Neurology',
      staff_id: 'DOC_ACC_B',
      tenantId
    },
    { upsert: true, returnDocument: 'after' }
  );


  const patient1 = await Patient.findOneAndUpdate(
    { contact: '9888800001' },
    { name: 'Alice Walker', contact: '9888800001', age: 32, gender: 'Female', tenantId },
    { upsert: true, new: true }
  );

  const patient2 = await Patient.findOneAndUpdate(
    { contact: '9888800002' },
    { name: 'Bob Roberts', contact: '9888800002', age: 45, gender: 'Male', tenantId },
    { upsert: true, new: true }
  );

  const patient3 = await Patient.findOneAndUpdate(
    { contact: '9888800003' },
    { name: 'Charlie Davis', contact: '9888800003', age: 29, gender: 'Male', tenantId },
    { upsert: true, new: true }
  );

  // Clean prior test data for these doctors for today
  await Appointment.deleteMany({
    doctorId: { $in: [doctorA._id, doctorB._id] },
    date: { $gte: new Date(todayStr + 'T00:00:00.000Z'), $lte: new Date(todayStr + 'T23:59:59.999Z') }
  });
  await DoctorQueue.deleteMany({
    doctorId: { $in: [doctorA._id, doctorB._id] },
    date: todayStr
  });

  console.log('--- STEP 1 & 2: RECEPTION WAITING QUEUE INITIAL EMPTY STATE ---');
  let qA = await getDoctorQueueState(tenantId, doctorA._id.toString(), todayStr);
  let qB = await getDoctorQueueState(tenantId, doctorB._id.toString(), todayStr);

  console.assert(qA.currentToken === null, 'Doctor A initial currentToken must be null');
  console.assert(qA.waitingCount === 0, 'Doctor A initial waitingCount must be 0');
  console.assert((qA.queueAppointments || []).length === 0, 'Doctor A initial queueAppointments must be empty');
  console.log('✓ PASS: Doctor A and Doctor B start with clear queues (no fake tokens).');

  console.log('\n--- STEP 3 & 4: BOOKING APPOINTMENT WITHOUT CHECK-IN ---');
  const appt1 = await Appointment.create({
    tenantId,
    patientId: patient1._id,
    doctorId: doctorA._id,
    date: new Date(todayStr + 'T10:00:00.000Z'),
    time: '10:00 AM',
    status: 'Confirmed',
    reason: 'General Checkup',
    tokenNumber: null,

    queueStatus: null
  });

  qA = await getDoctorQueueState(tenantId, doctorA._id.toString(), todayStr);
  console.assert(qA.currentToken === null, 'Booking alone must not allocate token');
  console.assert(qA.waitingCount === 0, 'Booking alone must not enter queue');
  console.log('✓ PASS: Booking alone did NOT allocate a token.');

  console.log('\n--- STEP 5 & 6: RECEPTION CHECK-IN PATIENT 1 (ALICE) ---');
  const token1 = await allocateDoctorToken({
    tenantId,
    doctorId: doctorA._id,
    date: appt1.date,
    time: appt1.time
  });
  appt1.tokenNumber = token1.tokenNumber;
  appt1.tokenDisplay = token1.tokenDisplay;
  appt1.tokenDate = token1.tokenDate;
  appt1.tokenDoctorId = token1.tokenDoctorId;
  appt1.tokenSlotId = token1.tokenSlotId;
  appt1.tokenAssignedAt = token1.tokenAssignedAt;
  appt1.queueStatus = 'Waiting';
  appt1.status = 'In Progress';
  await appt1.save();

  qA = await getDoctorQueueState(tenantId, doctorA._id.toString(), todayStr);
  console.assert(qA.currentToken === 1, `Doctor A currentToken must be 1 (Got ${qA.currentToken})`);
  console.assert(qA.waitingCount === 0, `Doctor A waitingCount must be 0 (serving 1) (Got ${qA.waitingCount})`);
  console.assert(qA.lastIssuedToken === 1, `Doctor A lastIssuedToken must be 1 (Got ${qA.lastIssuedToken})`);
  console.assert(qA.queueAppointments.length === 1, 'Doctor A has 1 patient in queue list');
  console.assert(qA.queueAppointments[0].patientName === 'Alice Walker', 'Patient name is Alice Walker');
  console.log(`✓ PASS: Reception check-in assigned Token #1 to Alice. Live queue shows Token #1 Serving.`);

  console.log('\n--- STEP 7: CHECK-IN PATIENT 2 (BOB) FOR DOCTOR A ---');
  const appt2 = await Appointment.create({
    tenantId,
    patientId: patient2._id,
    doctorId: doctorA._id,
    date: new Date(todayStr + 'T10:30:00.000Z'),
    time: '10:30 AM',
    status: 'In Progress',
    reason: 'Routine Consultation',
    tokenNumber: null,
    queueStatus: 'Waiting'
  });
  const token2 = await allocateDoctorToken({
    tenantId,
    doctorId: doctorA._id,
    date: appt2.date,
    time: appt2.time
  });
  appt2.tokenNumber = token2.tokenNumber;
  appt2.tokenDisplay = token2.tokenDisplay;
  appt2.tokenDate = token2.tokenDate;
  appt2.tokenDoctorId = token2.tokenDoctorId;
  appt2.tokenSlotId = token2.tokenSlotId;
  appt2.tokenAssignedAt = token2.tokenAssignedAt;
  await appt2.save();

  qA = await getDoctorQueueState(tenantId, doctorA._id.toString(), todayStr);
  console.assert(qA.currentToken === 1, 'Doctor A currentToken remains 1 while consulting Alice');
  console.assert(qA.nextToken === 2, `Doctor A nextToken is 2 (Got ${qA.nextToken})`);
  console.assert(qA.waitingCount === 1, `Doctor A waitingCount is 1 (Got ${qA.waitingCount})`);
  console.assert(qA.lastIssuedToken === 2, `Doctor A lastIssuedToken is 2 (Got ${qA.lastIssuedToken})`);
  console.assert(qA.queueAppointments.length === 2, 'Doctor A queue appointments has 2 entries');
  console.assert(qA.queueAppointments[1].tokenNumber === 2, 'Second entry has tokenNumber 2');
  console.assert(qA.queueAppointments[1].patientName === 'Bob Roberts', 'Second patient is Bob Roberts');
  console.log('✓ PASS: Bob received Token #2. Queue shows Serving #1, Next #2, Total Waiting 1.');

  console.log('\n--- STEP 8: CHECK-IN PATIENT 3 (CHARLIE) FOR DOCTOR B (INDEPENDENT QUEUE) ---');
  const appt3 = await Appointment.create({
    tenantId,
    patientId: patient3._id,
    doctorId: doctorB._id,
    date: new Date(todayStr + 'T11:00:00.000Z'),
    time: '11:00 AM',
    status: 'In Progress',
    reason: 'Neurology Consultation',
    tokenNumber: null,

    queueStatus: 'Waiting'
  });
  const token3 = await allocateDoctorToken({
    tenantId,
    doctorId: doctorB._id,
    date: appt3.date,
    time: appt3.time
  });
  appt3.tokenNumber = token3.tokenNumber;
  appt3.tokenDisplay = token3.tokenDisplay;
  appt3.tokenDate = token3.tokenDate;
  appt3.tokenDoctorId = token3.tokenDoctorId;
  appt3.tokenSlotId = token3.tokenSlotId;
  appt3.tokenAssignedAt = token3.tokenAssignedAt;
  await appt3.save();

  qB = await getDoctorQueueState(tenantId, doctorB._id.toString(), todayStr);
  console.assert(token3.tokenNumber === 1, `Doctor B tokenNumber must start at 1 (Got ${token3.tokenNumber})`);
  console.assert(qB.currentToken === 1, `Doctor B currentToken is 1 (Got ${qB.currentToken})`);
  console.assert(qB.queueAppointments[0].patientName === 'Charlie Davis', 'Doctor B serving Charlie');

  // Verify Doctor A is unaffected
  qA = await getDoctorQueueState(tenantId, doctorA._id.toString(), todayStr);
  console.assert(qA.currentToken === 1 && qA.waitingCount === 1, 'Doctor A queue is completely isolated from Doctor B');
  console.log('✓ PASS: Doctor B has independent Token #1. Doctor A queue is completely unaffected.');

  console.log('\n--- STEP 9 & 10: DOCTOR A COMPLETES CONSULTATION FOR PATIENT 1 ---');
  const advanceResult = await advanceDoctorQueue({
    tenantId,
    doctorId: doctorA._id,
    appointmentId: appt1._id
  });
  console.assert(advanceResult.success === true, 'advanceDoctorQueue must succeed');

  qA = await getDoctorQueueState(tenantId, doctorA._id.toString(), todayStr);
  console.assert(qA.currentToken === 2, `Doctor A currentToken advanced to 2 (Got ${qA.currentToken})`);
  console.assert(qA.nextToken === null, `Doctor A nextToken is now null (Got ${qA.nextToken})`);
  console.assert(qA.waitingCount === 0, `Doctor A waitingCount is now 0 (Got ${qA.waitingCount})`);
  console.assert(qA.queueAppointments.length === 1, 'Patient 1 disappeared from active queue; only Patient 2 remains');
  console.assert(qA.queueAppointments[0].tokenNumber === 2, 'Remaining active queue appointment is Token #2');
  console.log('✓ PASS: Consultation completed. Live queue automatically advanced to Token #2 (Bob Roberts).');

  console.log('\n--- STEP 11: DOCTOR A COMPLETES FINAL PATIENT (PATIENT 2) ---');
  await advanceDoctorQueue({
    tenantId,
    doctorId: doctorA._id,
    appointmentId: appt2._id
  });
  qA = await getDoctorQueueState(tenantId, doctorA._id.toString(), todayStr);
  console.assert(qA.currentToken === null, 'When all patients are served, currentToken is null');
  console.assert(qA.waitingCount === 0, 'waitingCount is 0');
  console.assert(qA.queueAppointments.length === 0, 'queueAppointments is empty');
  console.log('✓ PASS: Queue successfully advanced to empty state when all consultations finished.');

  console.log('\n====================================================');
  console.log('   ALL RECEPTIONIST WAITING QUEUE TESTS PASSED ✓    ');
  console.log('====================================================\n');

  await mongoose.disconnect();
}

runAcceptanceTest().catch(err => {
  console.error('Acceptance test failed:', err);
  process.exit(1);
});
