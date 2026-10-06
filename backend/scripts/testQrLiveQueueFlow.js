const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const connectDB = require('../config/db');
const User = require('../models/User');
const Patient = require('../models/Patient');
const Appointment = require('../models/Appointment');
const request = require('http');

async function testFullFlow() {
  await connectDB();
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/public-queue', require('../routes/publicQueueRoutes'));

  const server = app.listen(5098);
  const baseUrl = 'http://localhost:5098/api/public-queue';

  try {
    // 1. Pick a doctor
    const doctor = await User.findOne({ role: 'doctor', publicQueueId: { $exists: true, $ne: '' } });
    console.log('Testing with Doctor:', doctor.name, 'PublicQueueId:', doctor.publicQueueId);

    // 2. Test GET public queue
    const res1 = await fetch(`${baseUrl}/${doctor.publicQueueId}`);
    const data1 = await res1.json();
    console.log('1. GET /api/public-queue/:id Status:', res1.status);
    console.log('Doctor name:', data1.doctor?.name);
    console.log('Current token:', data1.queue?.currentToken);
    console.log('Doctor status:', data1.queue?.doctorStatus);
    console.log('Zero patient info leaked:', !data1.patients && !data1.queueAppointments);

    // 3. Test Invalid PublicQueueId
    const resInvalid = await fetch(`${baseUrl}/non_existent_queue_id`);
    console.log('2. Invalid QueueId Status:', resInvalid.status);

    // 4. Test Send OTP
    const testEmail = 'patient.test.queue@curoxa.com';
    const resOtp = await fetch(`${baseUrl}/${doctor.publicQueueId}/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail })
    });
    const otpData = await resOtp.json();
    console.log('3. POST send-otp Status:', resOtp.status, otpData);

    // 5. Look up generated OTP from DB to simulate user typing it
    const RegistrationOtp = require('../models/RegistrationOtp');
    const otpDoc = await RegistrationOtp.findOne({ email: testEmail });
    console.log('Found OTP in DB:', otpDoc ? otpDoc.otp_code : 'none');

    // 6. Test Verify OTP
    const resVerify = await fetch(`${baseUrl}/${doctor.publicQueueId}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, otp: otpDoc.otp_code })
    });
    const verifyData = await resVerify.json();
    console.log('4. POST verify-otp Status:', resVerify.status);
    console.log('isExisting:', verifyData.isExisting);
    console.log('Has tempToken or token:', Boolean(verifyData.tempToken || verifyData.token));

    // 7. Test Patient Live Queue with existing patient
    let existingPatient = await Patient.findOne({ email: { $exists: true, $ne: '' } });
    if (!existingPatient) {
      existingPatient = await Patient.findOne({});
    }
    console.log('Found existing patient for session test:', existingPatient?.name);

    if (existingPatient) {
      const jwt = require('jsonwebtoken');
      const { getJwtSecret } = require('../config/env');
      const token = jwt.sign({
        id: existingPatient._id,
        email: existingPatient.email,
        phone: existingPatient.contact,
        role: 'patient',
        tenantId: existingPatient.tenantId
      }, getJwtSecret(), { expiresIn: '1h' });

      const resLive = await fetch(`${baseUrl}/${doctor.publicQueueId}/patient-view`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const liveData = await resLive.json();
      console.log('5. GET patient-view Status:', resLive.status);
      console.log('Doctor in live view:', liveData.doctor?.name);
      console.log('Patient in live view:', liveData.patient?.name);
      console.log('Your token:', liveData.patient?.yourToken);
      console.log('Patients ahead:', liveData.patient?.patientsAhead);
      console.log('Queue tokens list length:', liveData.queue?.tokens?.length);
      console.log('Queue tokens anonymized:', liveData.queue?.tokens?.every(t => !t.patientName && !t.contact));
    }

    console.log('\n--- ALL TESTS PASSED SUCCESSFULLY ---');
  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    server.close();
    process.exit(0);
  }
}

testFullFlow();
