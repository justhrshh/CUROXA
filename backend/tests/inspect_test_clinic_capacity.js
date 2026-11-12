const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const connectDB = require('../config/db');

async function inspect() {
  await connectDB();
  const User = require('../models/User');
  const SuperAdminHospital = require('../models/SuperAdminHospital');
  const Appointment = require('../models/Appointment');
  const ReceptionQueue = require('../models/ReceptionQueue');
  const Counter = require('../models/Counter');

  const hospital = await SuperAdminHospital.findOne({ code: 'quroxa_test_clinic' }).lean();
  console.log('Hospital:', hospital ? { name: hospital.name, code: hospital.code } : 'Not found');

  const doctors = await User.find({ tenantId: 'quroxa_test_clinic', role: 'doctor' }).lean();
  console.log('Doctors count:', doctors.length);
  for (const doc of doctors) {
    console.log('Doctor:', {
      id: doc._id.toString(),
      name: doc.name,
      staff_id: doc.staff_id,
      dailyMaxCapacity: doc.dailyMaxCapacity,
      max_slots: doc.max_slots,
      weeklyOff: doc.weeklyOff
    });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  console.log('Today date:', todayStr);

  const startOfDay = new Date(todayStr + 'T00:00:00.000Z');
  const endOfDay = new Date(todayStr + 'T23:59:59.999Z');

  const appointments = await Appointment.find({
    tenantId: 'quroxa_test_clinic',
    $or: [
      { tokenDate: todayStr },
      { date: { $gte: startOfDay, $lte: endOfDay } }
    ]
  }).lean();
  console.log('Appointments today:', appointments.length);
  for (const a of appointments) {
    console.log('  Appt:', { id: a._id.toString(), doctorId: a.doctorId?.toString(), status: a.status, time: a.time });
  }

  const tickets = await ReceptionQueue.find({
    tenantId: 'quroxa_test_clinic',
    targetAppointmentDate: todayStr
  }).lean();
  console.log('Tickets today:', tickets.length);
  for (const t of tickets) {
    console.log('  Ticket:', { id: t._id.toString(), ticketNumber: t.ticketNumber, doctorId: t.doctorId?.toString(), status: t.status });
  }

  const counters = await Counter.find({ key: new RegExp('quroxa_test_clinic') }).lean();
  console.log('Counters:', counters);

  await mongoose.disconnect();
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
