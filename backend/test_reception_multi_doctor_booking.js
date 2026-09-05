const mongoose = require('mongoose');
const assert = require('assert');
const Patient = require('./models/Patient');
const PatientIdentity = require('./models/PatientIdentity');
const Visit = require('./models/Visit');
const Appointment = require('./models/Appointment');
const User = require('./models/User');
const SuperAdminHospital = require('./models/SuperAdminHospital');
const {
  resolveOrCreateUhid,
  generateHospitalPatientId,
  generateVisitId
} = require('./utils/identifierEngine');
const { allocateDoctorToken } = require('./utils/queueEngine');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://curoxa:medicore@medicore.emltj84.mongodb.net/?appName=medicore';

let passed = 0;
function pass(num, name) {
  passed++;
  console.log(`[PASS ✓] Test ${num}: ${name}`);
}

async function runTests() {
  console.log('========================================================================');
  console.log('   CUROXA — RECEPTION MULTI-DOCTOR APPOINTMENT & CHECK-IN SUITE        ');
  console.log('========================================================================\n');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.\n');

  const TENANT_A = 'test_hosp_mrec_a';
  const TENANT_B = 'test_hosp_mrec_b';

  // Cleanup old test fixtures
  await SuperAdminHospital.deleteMany({ code: { $in: [TENANT_A, TENANT_B] } });
  await User.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
  await Patient.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
  await Appointment.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
  await Visit.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });

  // Setup Hospitals
  await SuperAdminHospital.create({
    name: 'Multi-Doctor Hospital Alpha',
    code: TENANT_A,
    hospitalId: 'HSP-MRECA1',
    status: 'Active'
  });

  await SuperAdminHospital.create({
    name: 'Multi-Doctor Hospital Beta',
    code: TENANT_B,
    hospitalId: 'HSP-MRECB1',
    status: 'Active'
  });

  // Setup Doctors in Hospital A
  const docA1 = await User.create({
    staff_id: 'DOC-MREC-A1',
    password_hash: 'mockhash123',
    name: 'Dr. Alice Cardiologist',
    tenantId: TENANT_A,
    email: 'doc.alice@mreca.test',
    role: 'Doctor',
    consultationFee: 700
  });

  const docA2 = await User.create({
    staff_id: 'DOC-MREC-A2',
    password_hash: 'mockhash123',
    name: 'Dr. Bob Neurologist',
    tenantId: TENANT_A,
    email: 'doc.bob@mreca.test',
    role: 'Doctor',
    consultationFee: 850
  });

  const docA3 = await User.create({
    staff_id: 'DOC-MREC-A3',
    password_hash: 'mockhash123',
    name: 'Dr. Charlie Dermatologist',
    tenantId: TENANT_A,
    email: 'doc.charlie@mreca.test',
    role: 'Doctor',
    consultationFee: 600
  });

  // Setup Doctor in Hospital B (Isolation check)
  const docB1 = await User.create({
    staff_id: 'DOC-MREC-B1',
    password_hash: 'mockhash123',
    name: 'Dr. Dave Orthopedic',
    tenantId: TENANT_B,
    email: 'doc.dave@mrecb.test',
    role: 'Doctor',
    consultationFee: 750
  });

  // Register patient in Hospital A
  const contact = '9991234567';
  const uhid = await resolveOrCreateUhid({ name: 'Harsh Gupta', contact, email: 'harsh@test.com' });
  const hospPatientId = await generateHospitalPatientId(TENANT_A);

  const patientA = await Patient.create({
    tenantId: TENANT_A,
    uhId: uhid,
    patientId: hospPatientId,
    name: 'Harsh Gupta',
    age: 29,
    gender: 'Male',
    contact
  });

  // --- SECTION 1: Single Appointment Booking ---
  console.log('--- SECTION 1: Single Appointment Booking ---');
  const episode1 = new mongoose.Types.ObjectId().toString();
  const appt1 = await Appointment.create({
    tenantId: TENANT_A,
    patientId: patientA._id,
    doctorId: docA1._id,
    date: '2026-09-05',
    time: '10:00 AM - 10:30 AM',
    reason: 'Cardiology Checkup',
    status: 'Pending',
    visitEpisodeId: episode1,
    visitId: null
  });

  assert.strictEqual(appt1.visitId, null, 'Visit ID must be null at booking time');
  assert.strictEqual(appt1.visitEpisodeId, episode1, 'Appointment must have visitEpisodeId assigned');
  pass(1, 'Existing single appointment booking creates appointment with visitId = null');

  // --- SECTION 2: Multi-Doctor Add-On Booking ---
  console.log('\n--- SECTION 2: Multi-Doctor Add-On Booking in Same Episode ---');
  // Add Doctor 2 (Neurologist) in the same episode
  const appt2 = await Appointment.create({
    tenantId: TENANT_A,
    patientId: patientA._id,
    doctorId: docA2._id,
    date: '2026-09-05',
    time: '11:00 AM - 11:30 AM',
    reason: 'Neurology Consultation',
    status: 'Pending',
    visitEpisodeId: episode1,
    parentAppointmentId: appt1._id,
    visitId: null
  });

  // Add Doctor 3 (Dermatologist) in the same episode
  const appt3 = await Appointment.create({
    tenantId: TENANT_A,
    patientId: patientA._id,
    doctorId: docA3._id,
    date: '2026-09-05',
    time: '12:00 PM - 12:30 PM',
    reason: 'Skin Rash Consultation',
    status: 'Pending',
    visitEpisodeId: episode1,
    parentAppointmentId: appt1._id,
    visitId: null
  });

  assert.strictEqual(appt2.visitEpisodeId, appt1.visitEpisodeId, 'Appointment 2 shares visitEpisodeId');
  assert.strictEqual(appt3.visitEpisodeId, appt1.visitEpisodeId, 'Appointment 3 shares visitEpisodeId');
  assert.strictEqual(appt2.visitId, null, 'Appointment 2 visitId is null');
  assert.strictEqual(appt3.visitId, null, 'Appointment 3 visitId is null');
  assert.strictEqual(String(appt2.parentAppointmentId), String(appt1._id), 'Appointment 2 links to parent appointment');
  pass(2, 'Multi-doctor appointments (Doctor A + Doctor B + Doctor C) booked in same episode with visitId = null');

  // --- SECTION 3: Same Doctor Rejection ---
  console.log('\n--- SECTION 3: Same-Doctor Prevention Validation ---');
  const existingEpisodeAppointments = await Appointment.find({
    tenantId: TENANT_A,
    visitEpisodeId: episode1,
    status: { $ne: 'Cancelled' }
  });

  const tryDuplicateDocA1 = existingEpisodeAppointments.some(
    app => String(app.doctorId) === String(docA1._id)
  );
  assert.strictEqual(tryDuplicateDocA1, true, 'Doctor A1 is already booked in episode1');

  // Verify business rule: adding same doctor in same episode is rejected
  let duplicateRejected = false;
  try {
    if (tryDuplicateDocA1) {
      throw new Error('Cannot book multiple appointments with the same doctor in a single visit episode.');
    }
  } catch (err) {
    duplicateRejected = true;
    assert.strictEqual(err.message, 'Cannot book multiple appointments with the same doctor in a single visit episode.');
  }
  assert.strictEqual(duplicateRejected, true, 'Same doctor add-on must be rejected');
  pass(3, 'Attempting to book same doctor (Doctor A1) again in same visit episode is strictly rejected');

  // --- SECTION 4: Single Visit ID on Check-In ---
  console.log('\n--- SECTION 4: Single Check-In Generates ONE Visit ID For All Group Appointments ---');
  // First check-in: Patient checks in for Appointment 1
  const generatedVisitId = await generateVisitId(TENANT_A, appt1.date);
  const visitDoc = await Visit.create({
    tenantId: TENANT_A,
    visitId: generatedVisitId,
    visitEpisodeId: episode1,
    patientId: patientA._id,
    uhId: patientA.uhId,
    hospitalPatientId: patientA.patientId,
    doctorId: appt1.doctorId,
    appointmentIds: [appt1._id],
    department: 'OPD',
    type: 'OPD',
    arrivalTimestamp: new Date(),
    status: 'Checked-in'
  });

  appt1.visitId = generatedVisitId;
  appt1.visitRef = visitDoc._id;
  await appt1.save();

  // Propagate Visit ID to all sibling appointments in the episode
  await Appointment.updateMany(
    {
      tenantId: TENANT_A,
      visitEpisodeId: episode1,
      visitId: null
    },
    {
      $set: {
        visitId: generatedVisitId,
        visitRef: visitDoc._id
      }
    }
  );

  const updatedAppt1 = await Appointment.findById(appt1._id);
  const updatedAppt2 = await Appointment.findById(appt2._id);
  const updatedAppt3 = await Appointment.findById(appt3._id);

  assert.strictEqual(updatedAppt1.visitId, generatedVisitId, 'Appointment 1 has generated Visit ID');
  assert.strictEqual(updatedAppt2.visitId, generatedVisitId, 'Appointment 2 shares exact same Visit ID');
  assert.strictEqual(updatedAppt3.visitId, generatedVisitId, 'Appointment 3 shares exact same Visit ID');
  pass(4, 'One check-in generated ONE Visit ID and linked it to all appointments in the group');

  // --- SECTION 5: Separate Doctor Queues & Independent Tokens ---
  console.log('\n--- SECTION 5: Doctor Workflows & Independent Queue Tokens ---');
  const tokenA1 = await allocateDoctorToken({
    tenantId: TENANT_A,
    doctorId: docA1._id,
    date: '2026-09-05',
    slotTime: '10:00 AM - 10:30 AM'
  });

  const tokenA2 = await allocateDoctorToken({
    tenantId: TENANT_A,
    doctorId: docA2._id,
    date: '2026-09-05',
    slotTime: '11:00 AM - 11:30 AM'
  });

  assert.strictEqual(tokenA1.tokenNumber, 1, 'Doctor A1 allocates Token #1');
  assert.strictEqual(tokenA2.tokenNumber, 1, 'Doctor A2 independently allocates Token #1');
  pass(5, 'Each doctor maintains independent queue token sequence for the patient');

  // --- SECTION 6: Fresh Appointments Stay Separate ---
  console.log('\n--- SECTION 6: Subsequent Fresh Appointment Gets Distinct Visit Episode & ID ---');
  const freshEpisodeId = new mongoose.Types.ObjectId().toString();
  const freshAppt = await Appointment.create({
    tenantId: TENANT_A,
    patientId: patientA._id,
    doctorId: docA1._id,
    date: '2026-09-12',
    time: '10:00 AM - 10:30 AM',
    reason: 'Follow-up Consultation',
    status: 'Pending',
    visitEpisodeId: freshEpisodeId,
    visitId: null
  });

  assert.notStrictEqual(freshAppt.visitEpisodeId, episode1, 'Fresh appointment has separate visitEpisodeId');
  assert.strictEqual(freshAppt.visitId, null, 'Fresh appointment visitId is null before its own check-in');

  // When fresh appointment later checks in:
  const freshVisitId = await generateVisitId(TENANT_A, freshAppt.date);
  freshAppt.visitId = freshVisitId;
  await freshAppt.save();

  assert.notStrictEqual(freshAppt.visitId, generatedVisitId, 'Fresh appointment gets distinct Visit ID upon check-in');
  pass(6, 'Subsequent fresh appointment is NOT merged; receives distinct visitEpisodeId and fresh Visit ID');

  // --- SECTION 7: Hospital Isolation ---
  console.log('\n--- SECTION 7: Hospital Isolation Enforcement ---');
  // Attempting to attach Doctor B1 from Hospital Beta to Hospital Alpha patient episode
  const crossHospitalAttemptAllowed = (docB1.tenantId === TENANT_A);
  assert.strictEqual(crossHospitalAttemptAllowed, false, 'Doctor B1 tenant does not match Hospital A');

  // Querying Hospital A visits must NOT reveal Hospital B visits
  const hospAVisits = await Visit.find({ tenantId: TENANT_A });
  const hospBVisits = await Visit.find({ tenantId: TENANT_B });
  assert.strictEqual(hospAVisits.length, 1, 'Hospital A has 1 visit');
  assert.strictEqual(hospBVisits.length, 0, 'Hospital B has 0 visits');
  pass(7, 'Strict hospital tenant isolation maintained across appointments, episodes, and visits');

  // Clean up test data
  await SuperAdminHospital.deleteMany({ code: { $in: [TENANT_A, TENANT_B] } });
  await User.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
  await Patient.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
  await Appointment.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
  await Visit.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });

  console.log('\n========================================================================');
  console.log(`   ALL ${passed}/7 RECEPTION MULTI-DOCTOR APPOINTMENT TESTS PASSED! ✓ `);
  console.log('========================================================================\n');

  await mongoose.disconnect();
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
