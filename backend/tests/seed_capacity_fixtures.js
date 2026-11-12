/**
 * QUROXA — Fill Today's Doctor Capacity for Testing
 * 
 * Target:
 * - Clinic: quroxa_test_clinic
 * - Doctor: Dr. Test Two (6af406487b3d0357801d98c8)
 * - Date: Today's date (2026-11-11)
 * - dailyMaxCapacity: 5
 * - Existing Bookings: 1
 * - Test Bookings to Create: 4
 * 
 * Records all created synthetic IDs for clean-up audit.
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const connectDB = require('../config/db');

const User = require('../models/User');
const Patient = require('../models/Patient');
const ReceptionQueue = require('../models/ReceptionQueue');
const Counter = require('../models/Counter');
const Appointment = require('../models/Appointment');
const { allocateReceptionTicket, normalizeQueueDate } = require('../utils/receptionQueueEngine');

async function seedCapacity() {
  await connectDB();
  console.log('MongoDB Connected to Staging Database');

  const tenantId = 'quroxa_test_clinic';
  const clinicCode = 'quroxa_test_clinic';
  const doctorId = '6af406487b3d0357801d98c8'; // Dr. Test Two
  const todayStr = normalizeQueueDate(new Date());

  const doctor = await User.findOne({ _id: doctorId, tenantId, role: 'doctor' }).lean();
  if (!doctor) {
    throw new Error('Doctor Dr. Test Two not found in clinic ' + tenantId);
  }

  const capacity = doctor.dailyMaxCapacity || 5;
  console.log(`Doctor: ${doctor.name} | Configured Daily Max Capacity: ${capacity}`);

  // Inspect current bookings
  const existingAppts = await Appointment.find({
    tenantId,
    doctorId,
    status: { $nin: ['Cancelled', 'No-Show', 'no-show', 'Skipped'] },
    $or: [
      { tokenDate: todayStr },
      { date: { $gte: new Date(`${todayStr}T00:00:00.000Z`), $lte: new Date(`${todayStr}T23:59:59.999Z`) } }
    ]
  }).lean();

  const existingTickets = await ReceptionQueue.find({
    tenantId,
    doctorId,
    targetAppointmentDate: todayStr,
    status: { $in: ['Waiting', 'Called', 'Serving'] }
  }).lean();

  const currentBooked = existingAppts.length + existingTickets.length;
  console.log(`Current Bookings for Today (${todayStr}): ${currentBooked} (Appointments: ${existingAppts.length}, Queue Tickets: ${existingTickets.length})`);

  const slotsNeeded = capacity - currentBooked;
  console.log(`Slots needed to reach full capacity: ${slotsNeeded}`);

  if (slotsNeeded <= 0) {
    console.log('Doctor is ALREADY at full capacity for today.');
  }

  const createdFixtures = {
    clinicCode,
    tenantId,
    doctorId,
    doctorName: doctor.name,
    date: todayStr,
    seededAt: new Date().toISOString(),
    patientIds: [],
    ticketIds: []
  };

  for (let i = 1; i <= slotsNeeded; i++) {
    const synthSuffix = `${Date.now()}_${i}`;
    const synthPhone = `99000${String(i).padStart(2, '0')}${String(Date.now()).slice(-3)}`;
    const synthName = `TEST-FIXTURE-CAPACITY-FILL-${i}`;
    const synthUhid = `UH-SYNTH-CAP-${synthSuffix}`;
    const synthPatId = `PAT-SYNTH-CAP-${synthSuffix}`;

    const newPat = await Patient.create({
      tenantId,
      name: synthName,
      contact: synthPhone,
      gender: 'Other',
      age: 30,
      uhId: synthUhid,
      patientId: synthPatId,
      email: 'N/A'
    });
    createdFixtures.patientIds.push(newPat._id.toString());

    const ticket = await allocateReceptionTicket({
      tenantId,
      clinicCode,
      queueDate: todayStr,
      patientType: 'New',
      patientId: newPat._id,
      doctorId,
      targetAppointmentDate: todayStr,
      preliminaryDetails: {
        name: synthName,
        contact: synthPhone,
        gender: 'Other'
      }
    });
    createdFixtures.ticketIds.push(ticket._id.toString());
    console.log(`  Created Test Booking ${i}/${slotsNeeded}: Ticket ${ticket.ticketDisplay} for Patient ${synthName} (${newPat._id})`);
  }

  // Update capacity counter
  const reservationKey = `doctor_cap_lock_${tenantId}_${doctorId}_${todayStr}`;
  await Counter.findOneAndUpdate(
    { key: reservationKey },
    { $set: { seq: capacity } },
    { upsert: true }
  );

  // Authoritative Availability Check
  const finalAppts = await Appointment.find({
    tenantId,
    doctorId,
    status: { $nin: ['Cancelled', 'No-Show', 'no-show', 'Skipped'] },
    $or: [
      { tokenDate: todayStr },
      { date: { $gte: new Date(`${todayStr}T00:00:00.000Z`), $lte: new Date(`${todayStr}T23:59:59.999Z`) } }
    ]
  }).lean();

  const finalTickets = await ReceptionQueue.find({
    tenantId,
    doctorId,
    targetAppointmentDate: todayStr,
    status: { $in: ['Waiting', 'Called', 'Serving'] }
  }).lean();

  const totalFinalBooked = finalAppts.length + finalTickets.length;
  const remainingSlots = Math.max(0, capacity - totalFinalBooked);
  const availableSlots = remainingSlots;
  const isAvailable = remainingSlots > 0;
  const isFull = remainingSlots <= 0;

  console.log('\n===============================================================');
  console.log('  AUTHORITATIVE AVAILABILITY VERIFICATION REPORT');
  console.log('===============================================================');
  console.log(`  Doctor:          ${doctor.name} (${doctorId})`);
  console.log(`  Date:            ${todayStr}`);
  console.log(`  Daily Capacity:  ${capacity}`);
  console.log(`  Total Booked:    ${totalFinalBooked}`);
  console.log(`  remainingSlots:  ${remainingSlots}`);
  console.log(`  availableSlots:  ${availableSlots}`);
  console.log(`  isAvailable:     ${isAvailable}`);
  console.log(`  isFull:          ${isFull}`);
  console.log('===============================================================\n');

  // Save fixtures manifest
  const fixturesFile = path.join(__dirname, 'capacity_test_fixtures.json');
  fs.writeFileSync(fixturesFile, JSON.stringify(createdFixtures, null, 2));
  console.log('Created fixtures logged to:', fixturesFile);

  await mongoose.disconnect();
}

seedCapacity().catch(err => {
  console.error('Seeding Error:', err);
  process.exit(1);
});
