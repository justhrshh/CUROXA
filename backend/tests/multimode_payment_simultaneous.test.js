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

async function runTests() {
  console.log('===================================================================');
  console.log('QUROXA — MULTIMODE SIMULTANEOUS PAYMENT TEST SUITE');
  console.log('===================================================================');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const testTenant = 'multimode_test_tenant_' + Date.now();
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
    { role: 'superadmin', tenantId: testTenant, name: 'Receptionist Test User', staff_id: 'staff_test_99' },
    secret,
    { expiresIn: '1h' }
  );

  const app = express();
  app.use(express.json());
  // Pre-seed tenantId from decoded token for tenant-bound routes
  app.use((req, res, next) => {
    req.tenantId = testTenant;
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

  async function getJson(url) {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, data: json };
  }

  try {
    const patient = await Patient.create({
      tenantId: testTenant,
      name: 'Simultaneous Payment Patient',
      contact: '9888877777',
      age: 35,
      gender: 'Female'
    });

    // -------------------------------------------------------------------------
    // 1 & 3: Cash 500 + UPI 500 in ONE collection operation -> 2 entries, Paid, Balance 0
    // -------------------------------------------------------------------------
    console.log('[TEST 1 & 3] Cash ₹500 + UPI ₹500 in ONE collection operation');
    const bill1 = await Billing.create({
      tenantId: testTenant,
      patientId: patient._id,
      totalAmount: 1000,
      status: 'Unpaid'
    });

    const res1 = await postJson(`${baseUrl}/billing/${bill1._id}/collect-payment`, {
      payments: [
        { method: 'Cash', amount: 500 },
        { method: 'UPI', amount: 500, transactionRef: 'UPI_REF_500' }
      ]
    });

    assert(res1.status === 200, 'HTTP status is 200');
    assert(res1.data.success === true, 'Success flag is true');
    assert(res1.data.bill.status === 'Paid', 'Bill status is Paid');
    assert(res1.data.bill.amountPaid === 1000, 'Amount paid is 1000');
    assert(res1.data.bill.balanceDue === 0, 'Balance due is 0');
    assert(res1.data.bill.payments.length === 2, '2 payment entries created in ONE operation');
    assert(res1.data.bill.payments[0].method === 'Cash' && res1.data.bill.payments[0].amount === 500, 'Entry 1: Cash 500');
    assert(res1.data.bill.payments[1].method === 'UPI' && res1.data.bill.payments[1].amount === 500, 'Entry 2: UPI 500');
    assert(res1.data.bill.payments[0].collectionId === res1.data.bill.payments[1].collectionId, 'Both entries share same collectionId');

    // -------------------------------------------------------------------------
    // 2 & 4 & 5 & 6: Cash 500 + UPI 300 + Card 200 in ONE collection
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2, 4, 5, 6] Cash ₹500 + UPI ₹300 + Card ₹200 in ONE collection operation');
    const bill2 = await Billing.create({
      tenantId: testTenant,
      patientId: patient._id,
      totalAmount: 1000,
      status: 'Unpaid'
    });

    const res2 = await postJson(`${baseUrl}/billing/${bill2._id}/collect-payment`, {
      payments: [
        { method: 'Cash', amount: 500 },
        { method: 'UPI', amount: 300, transactionRef: 'UPI_REF_300' },
        { method: 'Card', amount: 200, transactionRef: 'CARD_AUTH_200' }
      ]
    });

    assert(res2.status === 200, 'HTTP status is 200');
    assert(res2.data.bill.status === 'Paid', 'Bill status is Paid');
    assert(res2.data.bill.amountPaid === 1000, 'Amount paid is 1000');
    assert(res2.data.bill.balanceDue === 0, 'Balance due is 0');
    assert(res2.data.bill.payments.length === 3, 'Three entries created in ONE request');
    assert(res2.data.bill.paymentMethod === 'Cash + UPI + Card', 'paymentMethod shows all combined methods');
    assert(Boolean(res2.data.collectionId), 'Returned collectionId');
    assert(res2.data.bill.payments.every(p => p.collectionId === res2.data.collectionId), 'All 3 entries group under the collectionId');

    // -------------------------------------------------------------------------
    // 7 & 8: Partial multimode collection (Cash 400 + UPI 200), followed by Card 400 settling remainder
    // -------------------------------------------------------------------------
    console.log('\n[TEST 7 & 8] Partial multimode collection + sequential final settlement');
    const bill3 = await Billing.create({
      tenantId: testTenant,
      patientId: patient._id,
      totalAmount: 1000,
      status: 'Unpaid'
    });

    // Step A: Partial collection Cash 400 + UPI 200 = 600
    const res3A = await postJson(`${baseUrl}/billing/${bill3._id}/collect-payment`, {
      payments: [
        { method: 'Cash', amount: 400 },
        { method: 'UPI', amount: 200 }
      ]
    });

    assert(res3A.status === 200, 'Step A HTTP 200');
    assert(res3A.data.bill.status === 'Partially Paid', 'Status is Partially Paid');
    assert(res3A.data.bill.amountPaid === 600, 'Amount paid is 600');
    assert(res3A.data.bill.balanceDue === 400, 'Balance due is 400');
    assert(res3A.data.bill.payments.length === 2, '2 entries stored');

    // Step B: Later payment Card 400 settles the bill
    const res3B = await postJson(`${baseUrl}/billing/${bill3._id}/collect-payment`, {
      payments: [
        { method: 'Card', amount: 400, transactionRef: 'CARD_LATER_400' }
      ]
    });

    assert(res3B.status === 200, 'Step B HTTP 200');
    assert(res3B.data.bill.status === 'Paid', 'Status is now Paid');
    assert(res3B.data.bill.amountPaid === 1000, 'Total amount paid is 1000');
    assert(res3B.data.bill.balanceDue === 0, 'Balance due is 0');
    assert(res3B.data.bill.payments.length === 3, 'Total 3 entries preserved across 2 collections');
    assert(res3B.data.bill.payments[0].collectionId === res3B.data.bill.payments[1].collectionId, 'Collection 1 entries share collectionId A');
    assert(res3B.data.bill.payments[2].collectionId !== res3B.data.bill.payments[0].collectionId, 'Collection 2 has distinct collectionId B');

    // -------------------------------------------------------------------------
    // 9: Overpayment rejected
    // -------------------------------------------------------------------------
    console.log('\n[TEST 9] Overpayment rejection');
    const bill4 = await Billing.create({
      tenantId: testTenant,
      patientId: patient._id,
      totalAmount: 1000,
      status: 'Unpaid'
    });

    const res4 = await postJson(`${baseUrl}/billing/${bill4._id}/collect-payment`, {
      payments: [
        { method: 'Cash', amount: 500 },
        { method: 'UPI', amount: 600 }
      ]
    });

    assert(res4.status === 400, 'HTTP 400 returned for overpayment');
    assert(res4.data.error.includes('Overpayment not allowed'), 'Clear overpayment error message');
    const reloadedBill4 = await Billing.findById(bill4._id);
    assert(reloadedBill4.status === 'Unpaid' && reloadedBill4.amountPaid === 0, 'No payments recorded on overpayment rejection');

    // -------------------------------------------------------------------------
    // 10, 11, 12: Zero, Negative, and Empty payment row rejected
    // -------------------------------------------------------------------------
    console.log('\n[TEST 10, 11, 12] Zero, Negative, and Empty payment row rejection');
    const resZero = await postJson(`${baseUrl}/billing/${bill4._id}/collect-payment`, {
      payments: [{ method: 'Cash', amount: 0 }]
    });
    assert(resZero.status === 400, 'Zero amount rejected with HTTP 400');

    const resNeg = await postJson(`${baseUrl}/billing/${bill4._id}/collect-payment`, {
      payments: [{ method: 'Cash', amount: -200 }]
    });
    assert(resNeg.status === 400, 'Negative amount rejected with HTTP 400');

    const resEmpty = await postJson(`${baseUrl}/billing/${bill4._id}/collect-payment`, {
      payments: []
    });
    assert(resEmpty.status === 400, 'Empty payment list rejected with HTTP 400');

    // -------------------------------------------------------------------------
    // 13: Duplicate submission / Idempotency protection
    // -------------------------------------------------------------------------
    console.log('\n[TEST 13] Duplicate submission / Idempotency key protection');
    const testReqId = 'REQ-IDEMPOTENCY-' + Date.now();
    const resIdemp1 = await postJson(`${baseUrl}/billing/${bill4._id}/collect-payment`, {
      requestId: testReqId,
      payments: [
        { method: 'Cash', amount: 500 },
        { method: 'UPI', amount: 500 }
      ]
    });
    assert(resIdemp1.status === 200, 'First submission succeeded');
    assert(resIdemp1.data.bill.payments.length === 2, 'Bill has 2 payments');

    // Replay with identical requestId (e.g. accidental double click)
    const resIdemp2 = await postJson(`${baseUrl}/billing/${bill4._id}/collect-payment`, {
      requestId: testReqId,
      payments: [
        { method: 'Cash', amount: 500 },
        { method: 'UPI', amount: 500 }
      ]
    });
    assert(resIdemp2.status === 200, 'Duplicate request returned 200 without error');
    assert(resIdemp2.data.duplicateIgnored === true, 'Flagged as duplicateIgnored');
    const bill4Check = await Billing.findById(bill4._id);
    assert(bill4Check.payments.length === 2, 'No duplicate payment entries created (still exactly 2)');
    assert(bill4Check.amountPaid === 1000, 'Amount paid is still 1000');

    // -------------------------------------------------------------------------
    // 14: Atomic validation failure behavior (If 3rd entry is invalid, 0 are saved)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 14] Atomic failure behavior');
    const bill5 = await Billing.create({
      tenantId: testTenant,
      patientId: patient._id,
      totalAmount: 1000,
      status: 'Unpaid'
    });

    const resFail = await postJson(`${baseUrl}/billing/${bill5._id}/collect-payment`, {
      payments: [
        { method: 'Cash', amount: 500 },
        { method: 'UPI', amount: 300 },
        { method: 'InvalidMethodName', amount: 200 }
      ]
    });
    assert(resFail.status === 400, 'Rejected with HTTP 400 due to invalid 3rd entry');
    const bill5Reloaded = await Billing.findById(bill5._id);
    assert(bill5Reloaded.payments.length === 0, 'Zero payments saved (neither Cash nor UPI was saved)');
    assert(bill5Reloaded.status === 'Unpaid', 'Bill remains Unpaid');

    // -------------------------------------------------------------------------
    // 15: Payment breakdown persists after reload from database
    // -------------------------------------------------------------------------
    console.log('\n[TEST 15] Persistence after reload');
    const bill2Reload = await Billing.findById(bill2._id).lean();
    assert(bill2Reload.payments.length === 3, 'Persisted all 3 entries in MongoDB');
    assert(bill2Reload.payments[0].method === 'Cash' && bill2Reload.payments[0].amount === 500, 'Persisted Cash 500');
    assert(bill2Reload.payments[1].method === 'UPI' && bill2Reload.payments[1].amount === 300, 'Persisted UPI 300');
    assert(bill2Reload.payments[2].method === 'Card' && bill2Reload.payments[2].amount === 200, 'Persisted Card 200');

    // -------------------------------------------------------------------------
    // 16: Audit log creation for multimode collection
    // -------------------------------------------------------------------------
    console.log('\n[TEST 16] Audit log created with collectionId and newPayments array');
    const auditRecord = await AuditLog.findOne({ target: String(bill2._id), action: 'payment_collected' });
    assert(Boolean(auditRecord), 'Audit record exists');
    assert(auditRecord.metadata.collectionId === res2.data.collectionId, 'Audit record tracks collectionId');
    assert(auditRecord.metadata.newPayments.length === 3, 'Audit record logged all 3 entries');

    // -------------------------------------------------------------------------
    // 17 & 18: Existing online payment remains separate and no collection allowed if already paid
    // -------------------------------------------------------------------------
    console.log('\n[TEST 17 & 18] Online payment separation & already-paid appointment guard');
    const apptOnline = await Appointment.create({
      tenantId: testTenant,
      patientId: patient._id,
      doctorId: testDoctorId,
      date: new Date(),
      time: '03:00 PM',
      reason: 'Online Follow-up',
      paymentStatus: 'Paid',
      status: 'Confirmed'
    });

    const billOnline = await Billing.create({
      tenantId: testTenant,
      patientId: patient._id,
      appointmentId: apptOnline._id,
      totalAmount: 1000,
      status: 'Paid',
      payments: [{
        paymentId: 'PAY-ONLINE-1',
        amount: 1000,
        method: 'Online UPI',
        source: 'Online',
        transactionRef: 'RZP_ORDER_9999'
      }]
    });

    // Attempting to approve/request payment on already-paid appointment must fail
    const approveRes = await fetch(`${baseUrl}/appointments/${apptOnline._id}/approve`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    const approveJson = await approveRes.json().catch(() => ({}));
    assert(approveRes.status === 400, 'Approve rejected on already-paid appointment');
    assert(approveJson.error.includes('already been completed in full'), 'Error explains payment already complete');

    // -------------------------------------------------------------------------
    // 19: Tenant isolation verification
    // -------------------------------------------------------------------------
    console.log('\n[TEST 19] Tenant isolation');
    const billOtherTenant = await Billing.create({
      tenantId: 'different_tenant_abc',
      patientId: patient._id,
      totalAmount: 1000,
      status: 'Unpaid'
    });
    const attemptCrossTenant = await postJson(`${baseUrl}/billing/${billOtherTenant._id}/collect-payment`, {
      payments: [{ method: 'Cash', amount: 1000 }]
    });
    assert(attemptCrossTenant.status === 404, 'Cannot collect payment on bill belonging to another tenant (404)');

    // -------------------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------------------
    console.log('\n[CLEANUP] Cleaning up test records...');
    await Billing.deleteMany({ tenantId: { $in: [testTenant, 'different_tenant_abc'] } });
    await Appointment.deleteMany({ tenantId: testTenant });
    await Patient.deleteMany({ tenantId: testTenant });
    await AuditLog.deleteMany({ tenantId: testTenant });
    console.log('✅ Cleanup complete.');

  } catch (err) {
    console.error('❌ Exception during tests:', err);
    failedCount++;
  } finally {
    server.close();
    await mongoose.disconnect();
    console.log(`\n===================================================================`);
    console.log(`MULTIMODE REGRESSION SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log(`===================================================================\n`);
    process.exit(failedCount > 0 ? 1 : 0);
  }
}

runTests();
