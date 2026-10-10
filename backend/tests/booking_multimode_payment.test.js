require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');
const express = require('express');
const Billing = require('../models/Billing');
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const AuditLog = require('../models/AuditLog');
const billingRouter = require('../routes/billingRoutes');
const appointmentRouter = require('../routes/appointmentRoutes');
const { getJwtSecret } = require('../config/env');

async function runBookingMultimodeTests() {
  console.log('===================================================================');
  console.log('QUROXA — BOOKING & SERVICE MULTIMODE PAYMENT TEST SUITE');
  console.log('===================================================================');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const testTenant = 'booking_multimode_tenant_' + Date.now();
  const testDoctorId = new mongoose.Types.ObjectId();
  
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passedCount++;
    } else {
      console.error(`  ❌ FAIL: ${testName}`);
      failedCount++;
    }
  }

  let secret;
  try {
    secret = getJwtSecret();
  } catch (e) {
    secret = process.env.JWT_SECRET || 'secret_key';
  }

  const token = jwt.sign(
    { role: 'receptionist', tenantId: testTenant, name: 'Booking Desk Officer', staff_id: 'rec_officer_01' },
    secret,
    { expiresIn: '1h' }
  );

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.tenantId = testTenant;
    req.user = {
      _id: new mongoose.Types.ObjectId(),
      staff_id: 'rec_officer_01',
      name: 'Booking Desk Officer',
      role: 'receptionist'
    };
    next();
  });
  app.use('/api/billing', billingRouter);
  app.use('/api/appointments', appointmentRouter);

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

  async function postJson(url, data) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, data: json };
  }

  try {
    const patient = await Patient.create({
      tenantId: testTenant,
      name: 'Multimode Booking Patient',
      contact: '9988776655',
      age: 29,
      gender: 'Female',
      uhId: 'UHID-BK-' + Date.now()
    });

    // -------------------------------------------------------------------------
    // TEST 1: Simultaneous Multimode Payment on Appointment Creation
    // (Cash 500 + UPI 300 + Card 200 on ₹1,000 Bill)
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Multimode payment during appointment booking (Cash 500 + UPI 300 + Card 200)');
    const appt1 = await Appointment.create({
      tenantId: testTenant,
      patientId: patient._id,
      doctorId: testDoctorId,
      date: new Date(),
      time: '09:30 AM - 10:00 AM',
      reason: 'OPD Consultation',
      status: 'Pending',
      paymentStatus: 'Pending'
    });

    const billRes1 = await postJson(`${baseUrl}/billing`, {
      patientId: patient._id,
      appointmentId: appt1._id,
      items: [{ description: 'Consultation Fee', amount: 950 }, { description: 'Registration Fee', amount: 50 }],
      totalAmount: 1000,
      originalAmount: 1000,
      paymentMethod: 'Cash + UPI + Card',
      payments: [
        { method: 'Cash', amount: 500 },
        { method: 'UPI', amount: 300, transactionRef: 'UPI-REF-001' },
        { method: 'Card', amount: 200, transactionRef: 'POS-AUTH-001' }
      ],
      requestId: 'REQ-BOOK-1'
    });

    assert(billRes1.status === 201, 'POST /api/billing returns HTTP 201');
    assert(billRes1.data.status === 'Paid', 'Bill status is Paid');
    assert(billRes1.data.amountPaid === 1000, 'amountPaid is exactly 1000');
    assert(billRes1.data.balanceDue === 0, 'balanceDue is 0');
    assert(billRes1.data.payments.length === 3, 'payments array contains 3 entries');

    const collId1 = billRes1.data.payments[0].collectionId;
    assert(collId1 && collId1.startsWith('PC-'), 'collectionId starts with PC-');
    assert(billRes1.data.payments.every(p => p.collectionId === collId1), 'All 3 entries share same collectionId');

    const uniquePayIds = new Set(billRes1.data.payments.map(p => p.paymentId));
    assert(uniquePayIds.size === 3, 'All 3 entries have distinct paymentIds');

    // Verify appointment status sync
    const updatedAppt1 = await Appointment.findById(appt1._id);
    assert(updatedAppt1.paymentStatus === 'Paid', 'Linked appointment paymentStatus synced to Paid');
    assert(updatedAppt1.status === 'Confirmed', 'Linked appointment status confirmed');

    // -------------------------------------------------------------------------
    // TEST 2: Partial Multimode Payment on Service / Lab Order
    // (Cash 300 + UPI 300 = ₹600 on ₹1,000 order -> Partially Paid, Due 400)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Partial multimode payment on service/lab order (Cash 300 + UPI 300 = ₹600)');
    const billRes2 = await postJson(`${baseUrl}/billing`, {
      patientId: patient._id,
      items: [{ description: 'Lipid Profile', amount: 600 }, { description: 'CBC Test', amount: 400 }],
      totalAmount: 1000,
      originalAmount: 1000,
      payments: [
        { method: 'Cash', amount: 300 },
        { method: 'UPI', amount: 300, transactionRef: 'UPI-PARTIAL-123' }
      ],
      requestId: 'REQ-LAB-PARTIAL'
    });

    assert(billRes2.status === 201, 'POST /api/billing returns HTTP 201');
    assert(billRes2.data.status === 'Partially Paid', 'Bill status is Partially Paid');
    assert(billRes2.data.amountPaid === 600, 'amountPaid is exactly 600');
    assert(billRes2.data.balanceDue === 400, 'balanceDue is exactly 400');
    assert(billRes2.data.paymentMethod === 'Cash + UPI', 'paymentMethod is Cash + UPI');

    // -------------------------------------------------------------------------
    // TEST 3: Overpayment Rejection at Booking Time
    // (Cash 600 + UPI 600 = ₹1,200 on ₹1,000 Bill -> 400 Bad Request)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] Server-side overpayment rejection at booking time');
    const billRes3 = await postJson(`${baseUrl}/billing`, {
      patientId: patient._id,
      items: [{ description: 'General Consultation', amount: 1000 }],
      totalAmount: 1000,
      payments: [
        { method: 'Cash', amount: 600 },
        { method: 'UPI', amount: 600 }
      ]
    });

    assert(billRes3.status === 400, 'Server rejects overpayment with HTTP 400');
    assert(billRes3.data.error.includes('exceeds net payable'), 'Error message states total payment exceeds net payable');

    // -------------------------------------------------------------------------
    // TEST 4: AuditLog Recorded with Multimode Action & CollectionId
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] AuditLog verification for booking multimode collection');
    const audit = await AuditLog.findOne({
      tenantId: testTenant,
      target: `Billing:${billRes1.data._id}`,
      action: 'PAYMENT_COLLECTED_MULTIMODE'
    });

    assert(audit !== null, 'AuditLog entry with action PAYMENT_COLLECTED_MULTIMODE was created');
    assert(audit?.metadata?.collectionId === collId1, 'AuditLog metadata.collectionId matches collectionId');
    assert(audit?.metadata?.totalCollected === 1000, 'AuditLog metadata.totalCollected is 1000');
    assert(audit?.metadata?.modes.length === 3, 'AuditLog metadata.modes contains all 3 payment methods');

    // -------------------------------------------------------------------------
    // TEST 5: Single Payment Fallback at Booking Time
    // (Cash ₹500 full payment on ₹500 bill -> Paid, 1 payment entry)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Single payment mode fallback at booking time');
    const appt2 = await Appointment.create({
      tenantId: testTenant,
      patientId: patient._id,
      doctorId: testDoctorId,
      date: new Date(),
      time: '11:00 AM - 11:30 AM',
      reason: 'Follow-up Consultation',
      status: 'Pending',
      paymentStatus: 'Pending'
    });

    const billRes5 = await postJson(`${baseUrl}/billing`, {
      patientId: patient._id,
      appointmentId: appt2._id,
      items: [{ description: 'Follow-up Consultation', amount: 500 }],
      totalAmount: 500,
      paymentMethod: 'Cash',
      status: 'Paid',
      amountPaid: 500
    });

    assert(billRes5.status === 201, 'POST /api/billing single mode returns HTTP 201');
    assert(billRes5.data.status === 'Paid', 'Bill status is Paid');
    assert(billRes5.data.payments.length === 1, 'Payments array has 1 entry');
    assert(billRes5.data.payments[0].method === 'Cash', 'Entry method is Cash');
    assert(billRes5.data.payments[0].amount === 500, 'Entry amount is 500');

    console.log('\n===================================================================');
    console.log(`TOTAL PASSED: ${passedCount}`);
    console.log(`TOTAL FAILED: ${failedCount}`);
    console.log('===================================================================');

    // Clean up
    await Billing.deleteMany({ tenantId: testTenant });
    await Appointment.deleteMany({ tenantId: testTenant });
    await Patient.deleteMany({ tenantId: testTenant });
    await AuditLog.deleteMany({ tenantId: testTenant });

    server.close();
    await mongoose.connection.close();
    process.exit(failedCount > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test execution error:', err);
    server.close();
    await mongoose.connection.close();
    process.exit(1);
  }
}

runBookingMultimodeTests();
