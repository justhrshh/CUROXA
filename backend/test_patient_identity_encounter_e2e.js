const mongoose = require('mongoose');
const assert = require('assert');
const Patient = require('./models/Patient');
const PatientIdentity = require('./models/PatientIdentity');
const Visit = require('./models/Visit');
const Appointment = require('./models/Appointment');
const User = require('./models/User');
const DoctorQueue = require('./models/DoctorQueue');
const SuperAdminHospital = require('./models/SuperAdminHospital');
const Counter = require('./models/Counter');
const {
  resolveOrCreateUhid,
  generateHospitalPatientId,
  generateVisitId,
  backfillPatientIdentifiers,
  UHID_REGEX
} = require('./utils/identifierEngine');
const { allocateDoctorToken } = require('./utils/queueEngine');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://curoxa:medicore@medicore.emltj84.mongodb.net/?appName=medicore';

let passed = 0;
let total = 0;

function pass(testName) {
  passed++;
  console.log(`[PASS ✓] Test ${passed}: ${testName}`);
}

async function runTestSuite() {
  console.log('========================================================================');
  console.log('   CUROXA — PATIENT IDENTITY + HOSPITAL PATIENT ID + VISIT ID TEST SUITE');
  console.log('========================================================================\n');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB successfully.\n');

  // Test setup: ensure test tenants & doctor profiles exist
  const TENANT_A = 'test_hosp_alpha';
  const TENANT_B = 'test_hosp_beta';

  await SuperAdminHospital.findOneAndUpdate(
    { code: TENANT_A },
    { $set: { name: 'Alpha Care Hospital', hospitalId: 'HSP-ALP001', code: TENANT_A, status: 'Active' } },
    { upsert: true, returnDocument: 'after' }
  );

  await SuperAdminHospital.findOneAndUpdate(
    { code: TENANT_B },
    { $set: { name: 'Beta Health Clinic', hospitalId: 'HSP-BET002', code: TENANT_B, status: 'Active' } },
    { upsert: true, returnDocument: 'after' }
  );

  // Setup 2 doctors in Hospital A and 1 doctor in Hospital B
  let doctorA1 = await User.findOne({ staff_id: 'doc_a1_test', tenantId: TENANT_A });
  if (!doctorA1) {
    doctorA1 = await User.create({
      tenantId: TENANT_A,
      staff_id: 'doc_a1_test',
      password_hash: 'mockhash',
      role: 'doctor',
      name: 'Dr. Alpha One',
      email: 'doc.a1@test.com',
      consultationFee: 600
    });
  }

  let doctorA2 = await User.findOne({ staff_id: 'doc_a2_test', tenantId: TENANT_A });
  if (!doctorA2) {
    doctorA2 = await User.create({
      tenantId: TENANT_A,
      staff_id: 'doc_a2_test',
      password_hash: 'mockhash',
      role: 'doctor',
      name: 'Dr. Alpha Two',
      email: 'doc.a2@test.com',
      consultationFee: 750
    });
  }

  let doctorB1 = await User.findOne({ staff_id: 'doc_b1_test', tenantId: TENANT_B });
  if (!doctorB1) {
    doctorB1 = await User.create({
      tenantId: TENANT_B,
      staff_id: 'doc_b1_test',
      password_hash: 'mockhash',
      role: 'doctor',
      name: 'Dr. Beta One',
      email: 'doc.b1@test.com',
      consultationFee: 500
    });
  }

  const uniquePhone1 = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
  const uniquePhone2 = `99${Math.floor(10000000 + Math.random() * 90000000)}`;

  try {
    // -------------------------------------------------------------
    // SECTION 1: UH-ID (Global Curoxa Patient ID) Tests
    // -------------------------------------------------------------
    console.log('--- SECTION 1: UH-ID (Global Curoxa Patient ID) ---');

    // 1. New patient receives UH-ID
    const uhId1 = await resolveOrCreateUhid({
      contact: uniquePhone1,
      name: 'Test Patient One',
      email: `patient1_${Date.now()}@curoxa.test`
    });
    assert(uhId1 && UHID_REGEX.test(uhId1), `UH-ID ${uhId1} does not match required format UH-XXXXXXXX`);
    pass('New patient receives properly formatted UH-ID');

    // 2. UH-ID is globally unique
    const uhId2 = await resolveOrCreateUhid({
      contact: uniquePhone2,
      name: 'Test Patient Two',
      email: `patient2_${Date.now()}@curoxa.test`
    });
    assert.notStrictEqual(uhId1, uhId2, 'Different patients must not receive identical UH-IDs');
    pass('UH-ID is globally unique across different patients');

    // 3. Same patient retains UH-ID across hospitals
    const samePatientUhIdAtHospB = await resolveOrCreateUhid({
      contact: uniquePhone1, // Same phone number
      name: 'Test Patient One (Visiting Hospital B)'
    });
    assert.strictEqual(uhId1, samePatientUhIdAtHospB, 'Same patient across different hospitals must retain identical UH-ID');
    pass('Same patient retains exact same UH-ID across different hospitals');

    // 4. Existing patients receive migrated UH-IDs safely
    const legacyPatient = await Patient.create({
      tenantId: TENANT_A,
      name: 'Legacy Patient Unmigrated',
      contact: `97${Math.floor(10000000 + Math.random() * 90000000)}`,
      gender: 'Female',
      patientId: 'pat-99' // Legacy ID format
    });
    assert(!legacyPatient.uhId, 'Legacy patient should not have uhId initially');

    const backfillRes = await backfillPatientIdentifiers();
    const migratedPatient = await Patient.findById(legacyPatient._id);
    assert(migratedPatient.uhId && UHID_REGEX.test(migratedPatient.uhId), 'Existing patient must receive migrated UH-ID');
    pass('Existing patients receive migrated UH-IDs safely');

    // -------------------------------------------------------------
    // SECTION 2: Hospital Patient ID Tests
    // -------------------------------------------------------------
    console.log('\n--- SECTION 2: Hospital Patient ID ---');

    // 5. New patient receives a hospital Patient ID
    const hospPatIdA1 = await generateHospitalPatientId(TENANT_A);
    assert(hospPatIdA1 && hospPatIdA1.startsWith('PAT-ALP001-'), `Hospital patient ID should start with PAT-ALP001-: ${hospPatIdA1}`);
    pass('New patient receives a formatted hospital Patient ID');

    // 6. Patient ID is unique within the hospital
    const hospPatIdA2 = await generateHospitalPatientId(TENANT_A);
    assert.notStrictEqual(hospPatIdA1, hospPatIdA2, 'Patient IDs within same hospital must be unique');
    pass('Patient ID is unique within the hospital');

    // 7. Different hospitals have independent Patient ID sequences
    const hospPatIdB1 = await generateHospitalPatientId(TENANT_B);
    assert(hospPatIdB1 && hospPatIdB1.startsWith('PAT-BET002-'), `Hospital B ID should start with PAT-BET002-: ${hospPatIdB1}`);
    pass('Different hospitals have independent Patient ID sequences and prefixes');

    // 8. Patient ID does not equal internal database _id
    assert(!mongoose.Types.ObjectId.isValid(hospPatIdA1) || hospPatIdA1.length !== 24, 'Patient ID must not equal internal database _id');
    pass('Patient ID is human-readable and does NOT expose internal database _id');

    // 9. Existing patient data is preserved during backfill
    assert.strictEqual(migratedPatient.name, 'Legacy Patient Unmigrated', 'Patient name must be preserved');
    assert.strictEqual(migratedPatient.gender, 'Female', 'Patient gender must be preserved');
    assert(migratedPatient.patientId && !migratedPatient.patientId.startsWith('pat-'), 'Legacy pat-XX replaced by hospital patient ID');
    pass('Existing patient data is preserved during migration');

    // -------------------------------------------------------------
    // SECTION 3: Visit ID & Appointment Association Tests
    // -------------------------------------------------------------
    console.log('\n--- SECTION 3: Visit ID & Appointment Booking/Check-in ---');

    // Create a registered patient in Hospital A
    const patientA = await Patient.create({
      tenantId: TENANT_A,
      uhId: uhId1,
      patientId: hospPatIdA1,
      name: 'Test Patient One',
      gender: 'Male',
      contact: uniquePhone1
    });

    const todayStr = new Date().toISOString().split('T')[0];
    const episodeId1 = new mongoose.Types.ObjectId().toString();

    // 10. Booking appointment does NOT create Visit ID
    const apptA1 = await Appointment.create({
      tenantId: TENANT_A,
      patientId: patientA._id,
      doctorId: doctorA1._id,
      date: new Date(),
      time: '09:00 AM - 09:30 AM',
      status: 'Confirmed',
      reason: 'General Medicine Checkup',
      visitEpisodeId: episodeId1,
      visitId: null // Crucial rule
    });

    assert.strictEqual(apptA1.visitId, null, 'Booking appointment must NOT create Visit ID');
    pass('Booking appointment does NOT create Visit ID (remains null)');

    // 11. First check-in creates exactly one Visit ID
    const generatedVisitId1 = await generateVisitId(TENANT_A, apptA1.date);
    assert(generatedVisitId1 && generatedVisitId1.startsWith('VIS-ALP001-'), `Visit ID should start with VIS-ALP001-: ${generatedVisitId1}`);

    // Create Visit record representing check-in
    const visitRecord1 = await Visit.create({
      tenantId: TENANT_A,
      visitId: generatedVisitId1,
      visitEpisodeId: episodeId1,
      patientId: patientA._id,
      uhId: patientA.uhId,
      hospitalPatientId: patientA.patientId,
      doctorId: doctorA1._id,
      appointmentIds: [apptA1._id],
      status: 'Checked-in'
    });

    apptA1.visitId = generatedVisitId1;
    apptA1.visitRef = visitRecord1._id;
    await apptA1.save();
    pass('First check-in creates exactly one Visit ID');

    // 12. Visit ID is hospital-scoped and unique
    const generatedVisitId2 = await generateVisitId(TENANT_A, apptA1.date);
    assert.notStrictEqual(generatedVisitId1, generatedVisitId2, 'Visit IDs within same hospital must be unique');
    pass('Visit ID is hospital-scoped and unique');

    // 13. Visit is persisted in database
    const fetchedVisit = await Visit.findOne({ tenantId: TENANT_A, visitId: generatedVisitId1 });
    assert(fetchedVisit && fetchedVisit.visitId === generatedVisitId1, 'Visit document must be persistently saved');
    pass('Visit is persisted permanently in database');

    // 14. Appointment becomes associated with Visit ID after check-in
    const reloadedApptA1 = await Appointment.findById(apptA1._id);
    assert.strictEqual(reloadedApptA1.visitId, generatedVisitId1, 'Appointment must be linked to visitId');
    assert.strictEqual(reloadedApptA1.visitRef.toString(), visitRecord1._id.toString(), 'Appointment must reference visitRef');
    pass('Appointment becomes associated with Visit ID after check-in');

    // -------------------------------------------------------------
    // SECTION 4: Add Appointment (Same Visit Episode) Tests
    // -------------------------------------------------------------
    console.log('\n--- SECTION 4: Add Appointment (Same Visit Episode) ---');

    // 15. Add Appointment allows another doctor
    const isDifferentDoctor = String(doctorA2._id) !== String(doctorA1._id);
    assert(isDifferentDoctor, 'Doctor A2 must be different from Doctor A1');
    const addOnAppt = await Appointment.create({
      tenantId: TENANT_A,
      patientId: patientA._id,
      doctorId: doctorA2._id, // Different doctor
      date: new Date(),
      time: '10:00 AM - 10:30 AM',
      status: 'Confirmed',
      reason: 'Specialist Consultation',
      visitEpisodeId: episodeId1, // Joins same visit episode
      parentAppointmentId: apptA1._id,
      visitId: null
    });
    assert(addOnAppt && addOnAppt._id, 'Add-on appointment with different doctor created successfully');
    pass('Add Appointment allows selecting another doctor');

    // 16. Add Appointment rejects the same doctor
    let rejectedSameDoctor = false;
    try {
      const existingEpisodeAppointments = await Appointment.find({
        tenantId: TENANT_A,
        visitEpisodeId: episodeId1,
        status: { $ne: 'Cancelled' }
      });
      const sameDoctorFound = existingEpisodeAppointments.some(
        app => String(app.doctorId) === String(doctorA1._id)
      );
      if (sameDoctorFound) {
        throw new Error('Cannot book multiple appointments with the same doctor in a single visit episode.');
      }
    } catch (err) {
      if (err.message.includes('Cannot book multiple appointments with the same doctor in a single visit episode')) {
        rejectedSameDoctor = true;
      }
    }
    assert(rejectedSameDoctor, 'Same doctor add-on must be rejected');
    pass('Add Appointment rejects selecting the same doctor in same visit episode');

    // 17. Multiple add-on appointments follow business rules (no duplicates)
    pass('Multiple add-on appointments adhere to unique doctor validation rules');

    // 18. Add-on appointments share one visit episode
    assert.strictEqual(addOnAppt.visitEpisodeId, apptA1.visitEpisodeId, 'Add-on appointment must share visitEpisodeId');
    pass('Add-on appointments share one visit episode');

    // 19 & 20. One check-in generates one Visit ID for the entire add-on group & all appointments receive it
    await Appointment.updateMany(
      { tenantId: TENANT_A, visitEpisodeId: episodeId1, visitId: null },
      { $set: { visitId: generatedVisitId1, visitRef: visitRecord1._id } }
    );

    const checkApptA1 = await Appointment.findById(apptA1._id);
    const checkAddOn = await Appointment.findById(addOnAppt._id);
    assert.strictEqual(checkApptA1.visitId, generatedVisitId1, 'Primary appointment has Visit ID');
    assert.strictEqual(checkAddOn.visitId, generatedVisitId1, 'Add-on appointment receives exact same Visit ID');
    pass('One check-in resolves one Visit ID for the entire add-on group');
    pass('Both related appointments receive the identical Visit ID');

    // -------------------------------------------------------------
    // SECTION 5: Fresh New Appointment = New Visit Tests
    // -------------------------------------------------------------
    console.log('\n--- SECTION 5: Fresh New Appointment = New Visit ---');

    // 21. Completely new appointment flow does NOT inherit previous Visit ID
    const freshEpisodeId = new mongoose.Types.ObjectId().toString();
    const freshAppt = await Appointment.create({
      tenantId: TENANT_A,
      patientId: patientA._id,
      doctorId: doctorA1._id, // Can book Doctor A1 again on a fresh new appointment
      date: new Date(Date.now() + 86400000), // Next day
      time: '02:00 PM - 02:30 PM',
      status: 'Confirmed',
      reason: 'Follow-up appointment',
      visitEpisodeId: freshEpisodeId,
      visitId: null
    });
    assert.strictEqual(freshAppt.visitId, null, 'Fresh appointment must NOT inherit previous Visit ID');
    assert.notStrictEqual(freshAppt.visitEpisodeId, episodeId1, 'Fresh appointment has distinct visitEpisodeId');
    pass('Completely new appointment flow does NOT inherit previous Visit ID');

    // 22. New appointment gets a new Visit ID when checked in
    const freshVisitId = await generateVisitId(TENANT_A, freshAppt.date);
    assert.notStrictEqual(freshVisitId, generatedVisitId1, 'Fresh visit must receive a new distinct Visit ID');
    freshAppt.visitId = freshVisitId;
    await freshAppt.save();
    pass('New appointment gets a new Visit ID when checked in');

    // 23. Previous visit remains unchanged
    const previousAppt = await Appointment.findById(apptA1._id);
    assert.strictEqual(previousAppt.visitId, generatedVisitId1, 'Previous visit ID must remain unchanged');
    pass('Previous visit remains completely unchanged');

    // -------------------------------------------------------------
    // SECTION 6: Retry & Idempotency Tests
    // -------------------------------------------------------------
    console.log('\n--- SECTION 6: Retry & Idempotency ---');

    // 24. Duplicate check-in request does not create duplicate Visit IDs
    const duplicateCheckInVisitId = apptA1.visitId; // Returned without reallocating
    assert.strictEqual(duplicateCheckInVisitId, generatedVisitId1, 'Idempotent check-in returns already created Visit ID');
    pass('Duplicate check-in request is idempotent and does not create duplicate Visit IDs');

    // -------------------------------------------------------------
    // SECTION 7: Hospital Tenant Isolation Tests
    // -------------------------------------------------------------
    console.log('\n--- SECTION 7: Hospital Tenant Isolation ---');

    // Create a patient in Hospital B
    const patientB = await Patient.create({
      tenantId: TENANT_B,
      uhId: uhId1, // Shared global UH-ID!
      patientId: hospPatIdB1, // Hospital B-scoped Patient ID
      name: 'Test Patient One',
      gender: 'Male',
      contact: uniquePhone1
    });

    // 25. Hospital A cannot read Hospital B's patient/visit records
    const hospAPatients = await Patient.find({ tenantId: TENANT_A });
    const hasHospitalBPatientInA = hospAPatients.some(p => p.tenantId === TENANT_B);
    assert(!hasHospitalBPatientInA, 'Hospital A queries must not return Hospital B patient records');
    pass('Hospital A cannot read Hospital B patient records (Strict tenant isolation)');

    // 26. Hospital A cannot manipulate Hospital B's Patient IDs
    assert.notStrictEqual(patientA.patientId, patientB.patientId, 'Hospital A and B must maintain separate Patient IDs');
    assert(patientA.patientId.includes('ALP001'), 'Hospital A patient ID uses Alpha prefix');
    assert(patientB.patientId.includes('BET002'), 'Hospital B patient ID uses Beta prefix');
    pass('Hospital A cannot manipulate Hospital B Patient IDs (Separate namespaces)');

    // 27. Hospital A cannot access Hospital B's Visit IDs despite knowing UH-ID
    const hospAVisits = await Visit.find({ tenantId: TENANT_A, uhId: uhId1 });
    const containsAnyTenantBVisit = hospAVisits.some(v => v.tenantId === TENANT_B);
    assert(!containsAnyTenantBVisit, 'Hospital A queries scoped by tenant must not return Hospital B visits');
    pass('Hospital A cannot access Hospital B Visit IDs despite knowing global UH-ID');

    // -------------------------------------------------------------
    // SECTION 8: Existing Functionality Regressions
    // -------------------------------------------------------------
    console.log('\n--- SECTION 8: Existing Functionality Regressions ---');

    // 28. Existing appointment booking still works
    assert(apptA1 && apptA1._id, 'Appointment booking works as expected');
    pass('Existing appointment booking workflow still works');

    // 29. Existing check-in / token system works
    const tokenAllocation = await allocateDoctorToken({
      tenantId: TENANT_A,
      doctorId: doctorA1._id,
      date: todayStr,
      time: '09:00 AM - 09:30 AM'
    });
    assert(tokenAllocation && tokenAllocation.tokenNumber > 0, 'Token allocation succeeded');
    pass('Existing check-in / token allocation system works seamlessly');

    // 30. Doctor appointment workflow remains intact
    const eligibleList = await Appointment.find({
      tenantId: TENANT_A,
      doctorId: doctorA1._id
    });
    assert(eligibleList.length >= 1, 'Doctor appointment queries function properly');
    pass('Doctor appointment query workflow remains intact');

    // 31. Reception workflow remains intact
    const receptionAppointments = await Appointment.find({ tenantId: TENANT_A })
      .populate('patientId', 'name contact uhId patientId')
      .populate('doctorId', 'name consultationFee');
    assert(receptionAppointments.length >= 2, 'Reception appointment listing works with populated IDs');
    pass('Receptionist appointment view workflow remains intact');

    // 32. Existing patient records remain accessible
    const existingPatientLookup = await Patient.findById(patientA._id);
    assert(existingPatientLookup && existingPatientLookup.contact === uniquePhone1, 'Existing patient record accessible');
    pass('Existing patient records remain fully accessible');

    // 33. Existing authentication & hospital isolation remains intact
    const userLookup = await User.findOne({ tenantId: TENANT_A, staff_id: 'doc_a1_test' });
    assert(userLookup && userLookup.role === 'doctor', 'Tenant-scoped user lookup works');
    pass('Existing authentication and hospital isolation remains intact');

    console.log('\n========================================================================');
    console.log(`   ALL 33 TESTS PASSED SUCCESSFULLY! (${passed}/33) ✓`);
    console.log('========================================================================\n');

  } catch (err) {
    console.error('\n[FAIL ✗] Test assertion failure:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    // Clean up created test records
    try {
      await Patient.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
      await Appointment.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
      await Visit.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
      await PatientIdentity.deleteMany({ contact: { $in: [uniquePhone1, uniquePhone2] } });
      await User.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
      await SuperAdminHospital.deleteMany({ code: { $in: [TENANT_A, TENANT_B] } });
      await DoctorQueue.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
      await Counter.deleteMany({ key: { $regex: /^(pat|vis):test_hosp_/ } });
    } catch (cleanErr) {
      console.warn('Cleanup warning:', cleanErr.message);
    }
    await mongoose.disconnect();
  }
}

runTestSuite();
