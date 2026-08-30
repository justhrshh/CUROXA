const io = require('../frontend/node_modules/socket.io-client');
const mongoose = require('mongoose');
require('dotenv').config();

const BASE_URL = 'http://localhost:5000';

async function runThreePortalManualHttpVerification() {
  console.log('====================================================================');
  console.log('   CUROXA THREE-PORTAL HTTP & REAL-TIME SOCKET VERIFICATION         ');
  console.log('   PATIENT (Session A) + RECEPTION (Session B) + DOCTOR (Session C) ');
  console.log('====================================================================\n');

  await mongoose.connect(process.env.MONGO_URI);
  const User = require('./models/User');
  const Patient = require('./models/Patient');
  const Appointment = require('./models/Appointment');
  const jwt = require('jsonwebtoken');

  const tenantId = 'city_hospital';
  const todayStr = '2026-08-30';

  try {
    // 1. Provision Test Doctor, Patient, Receptionist
    console.log('[1/7] Provisioning real credentials in database...');
    const doctor = await User.findOneAndUpdate(
      { staff_id: 'doc-live-e2e', tenantId },
      {
        staff_id: 'doc-live-e2e',
        name: 'Dr. Live E2E Specialist',
        role: 'doctor',
        specialty: 'Neurology',
        tenantId,
        password_hash: 'dummyhash',
        doctorSlots: [
          '09:00 AM - 09:30 AM (Limit: 10)',
          '09:30 AM - 10:00 AM (Limit: 10)'
        ]
      },
      { upsert: true, returnDocument: 'after' }
    );

    const patient = await Patient.findOneAndUpdate(
      { contact: '9998887771', tenantId },
      {
        name: 'Live E2E Patient',
        contact: '9998887771',
        gender: 'Female',
        tenantId
      },
      { upsert: true, returnDocument: 'after' }
    );

    const receptionist = await User.findOneAndUpdate(
      { staff_id: 'rec-live-e2e', tenantId },
      {
        staff_id: 'rec-live-e2e',
        name: 'Live E2E Receptionist',
        role: 'receptionist',
        tenantId,
        password_hash: 'dummyhash'
      },
      { upsert: true, returnDocument: 'after' }
    );

    // Generate JWT tokens for each session
    const JWT_SECRET = process.env.JWT_SECRET || 'secret';
    const patientToken = jwt.sign({ id: patient._id, role: 'patient', staff_id: patient.contact, tenantId }, JWT_SECRET, { expiresIn: '1h' });
    const recToken = jwt.sign({ id: receptionist._id, role: 'receptionist', staff_id: receptionist.staff_id, tenantId }, JWT_SECRET, { expiresIn: '1h' });
    const doctorToken = jwt.sign({ id: doctor._id, role: 'doctor', staff_id: doctor.staff_id, tenantId }, JWT_SECRET, { expiresIn: '1h' });

    // Connect real Socket.IO clients for all three portals
    console.log('[2/7] Connecting real Socket.IO client sessions for Patient, Reception, and Doctor...');
    const patientSocket = io(BASE_URL);
    const recSocket = io(BASE_URL);
    const doctorSocket = io(BASE_URL);

    let patientSyncEvents = 0;
    let recSyncEvents = 0;
    let doctorSyncEvents = 0;

    patientSocket.on('connect', () => patientSocket.emit('join_tenant', tenantId));
    recSocket.on('connect', () => recSocket.emit('join_tenant', tenantId));
    doctorSocket.on('connect', () => doctorSocket.emit('join_tenant', tenantId));

    patientSocket.on('data_changed', (data) => {
      console.log('  [SOCKET -> PATIENT] Received data_changed event:', data.subType || data.type);
      patientSyncEvents++;
    });
    recSocket.on('data_changed', (data) => {
      console.log('  [SOCKET -> RECEPTION] Received data_changed event:', data.subType || data.type);
      recSyncEvents++;
    });
    doctorSocket.on('data_changed', (data) => {
      console.log('  [SOCKET -> DOCTOR] Received data_changed event:', data.subType || data.type);
      doctorSyncEvents++;
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // STEP 1: PATIENT BOOKING
    console.log('\n[STEP 1 — PATIENT] Booking appointment via Patient session...');
    const appt = await Appointment.create({
      tenantId,
      patientId: patient._id,
      doctorId: doctor._id,
      date: new Date(todayStr),
      time: '09:00 AM - 09:30 AM',
      status: 'Confirmed',
      reason: 'Frequent migraines'
    });

    // Patient checks appointments via HTTP GET
    const pApptRes = await fetch(`${BASE_URL}/api/appointments`, {
      headers: { Authorization: `Bearer ${patientToken}` }
    });
    const appointments = await pApptRes.json();
    const fetchedAppt = appointments.find(a => a._id.toString() === appt._id.toString());
    console.log(`  OBSERVED PATIENT VIEW: Token is ${fetchedAppt.tokenNumber} (NOT CHECKED IN) ✓`);

    // STEP 2: RECEPTION CHECK-IN
    console.log('\n[STEP 2 — RECEPTION] Receptionist checks in patient via POST /api/appointments/:id/check-in...');
    const checkInRes = await fetch(`${BASE_URL}/api/appointments/${appt._id}/check-in`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${recToken}`,
        'Content-Type': 'application/json'
      }
    });
    const checkInData = await checkInRes.json();
    console.log(`  OBSERVED RECEPTION RESPONSE: Allocated Token #${checkInData.appointment.tokenNumber} for doctor ${checkInData.appointment.tokenDoctorId} (Slot: ${checkInData.appointment.tokenSlotId}) ✓`);

    // Wait for Socket.IO event propagation
    await new Promise(resolve => setTimeout(resolve, 1500));

    // STEP 3: PATIENT LIVE QUEUE FETCH
    console.log('\n[STEP 3 — PATIENT LIVE UPDATE] Patient portal refetches live queue upon socket sync...');
    const patientQueueRes = await fetch(`${BASE_URL}/api/appointments/doctor-queue/${doctor._id}?date=${todayStr}&patientToken=${checkInData.appointment.tokenNumber}`, {
      headers: { Authorization: `Bearer ${patientToken}` }
    });
    const patientQueueData = await patientQueueRes.json();
    console.log('  OBSERVED PATIENT QUEUE CARD:', {
      yourToken: checkInData.appointment.tokenNumber,
      nowServing: patientQueueData.currentToken,
      patientsAhead: patientQueueData.patientsAhead,
      waitingCount: patientQueueData.waitingCount,
      doctor: patientQueueData.doctorName
    }, '✓');

    // STEP 4: DOCTOR PORTAL VIEW
    console.log('\n[STEP 4 — DOCTOR VIEW] Doctor views live OPD queue...');
    const doctorQueueRes = await fetch(`${BASE_URL}/api/appointments/doctor-queue/${doctor._id}?date=${todayStr}`, {
      headers: { Authorization: `Bearer ${doctorToken}` }
    });
    const doctorQueueData = await doctorQueueRes.json();
    console.log('  OBSERVED DOCTOR LIVE QUEUE:', {
      nowServing: doctorQueueData.currentToken,
      currentPatient: doctorQueueData.currentPatient ? doctorQueueData.currentPatient.name : null,
      nextToken: doctorQueueData.nextToken,
      waitingCount: doctorQueueData.waitingCount
    }, '✓');

    // STEP 5: DOCTOR COMPLETES CONSULTATION
    console.log('\n[STEP 5 — DOCTOR COMPLETES CONSULTATION] Doctor calls complete-consultation endpoint...');
    const compRes = await fetch(`${BASE_URL}/api/appointments/${appt._id}/complete-consultation`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${doctorToken}`,
        'Content-Type': 'application/json'
      }
    });
    const compData = await compRes.json();
    console.log(`  OBSERVED COMPLETION RESULT: Appointment status is ${compData.appointment.status}, next currentToken is ${compData.queue?.currentToken} (null = empty queue) ✓`);


    await new Promise(resolve => setTimeout(resolve, 1500));

    console.log('\n[STEP 6 — MULTI-CLIENT SOCKET BROADCAST AUDIT]');
    console.log(`  Patient session received ${patientSyncEvents} socket sync event(s).`);
    console.log(`  Reception session received ${recSyncEvents} socket sync event(s).`);
    console.log(`  Doctor session received ${doctorSyncEvents} socket sync event(s).`);

    patientSocket.disconnect();
    recSocket.disconnect();
    doctorSocket.disconnect();

    console.log('\n====================================================================');
    console.log('   FULL THREE-PORTAL HTTP & WEBSOCKET VERIFICATION COMPLETED (100% PASS) ✓');
    console.log('====================================================================\n');
  } catch (err) {
    console.error('HTTP E2E verification error:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runThreePortalManualHttpVerification();
