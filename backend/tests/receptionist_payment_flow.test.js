require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const Billing = require('../models/Billing');
const Appointment = require('../models/Appointment');
const Patient = require('../models/Patient');
const AuditLog = require('../models/AuditLog');

async function runTests() {
  console.log('===================================================================');
  console.log('RECEPTIONIST PAYMENT FLOW & SPLIT PAYMENT REGRESSION SUITE');
  console.log('===================================================================');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB\n');

  const testTenant = 'test_tenant_' + Date.now();
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

  try {
    // 0. Setup dummy patient
    const patient = await Patient.create({
      tenantId: testTenant,
      name: 'Test Payment Patient',
      contact: '9999988888',
      age: 30,
      gender: 'Male'
    });

    // -------------------------------------------------------------
    // Test Case 1: Online Payment Completed During Booking -> Status = PAID, No Balance
    // -------------------------------------------------------------
    console.log('[TEST 1] Online payment completed during booking');
    const appt1 = await Appointment.create({
      tenantId: testTenant,
      patientId: patient._id,
      doctorId: testDoctorId,
      date: new Date(),
      time: '10:00 AM',
      reason: 'Routine Consultation',
      paymentStatus: 'Paid',
      status: 'Confirmed'
    });

    const bill1 = new Billing({
      tenantId: testTenant,
      patientId: patient._id,
      appointmentId: appt1._id,
      totalAmount: 1000,
      status: 'Paid',
      paymentMethod: 'Online UPI',
      payments: [{
        paymentId: 'PAY-ONL-1',
        amount: 1000,
        method: 'Online UPI',
        source: 'Online',
        transactionRef: 'RZP_123456789',
        recordedBy: 'Patient Portal',
        recordedByName: 'Test Payment Patient',
        recordedAt: new Date()
      }]
    });
    await bill1.save();

    assert(bill1.status === 'Paid', 'Bill status is Paid');
    assert(bill1.amountPaid === 1000, 'Bill amountPaid is 1000');
    assert(bill1.balanceDue === 0, 'Bill balanceDue is 0');
    assert(bill1.payments.length === 1, 'Payments array has 1 entry');
    assert(bill1.payments[0].source === 'Online', 'Source is Online');

    // -------------------------------------------------------------
    // Test Case 2: Unpaid Appointment Creation -> Status = UNPAID, Balance Due = 1000
    // -------------------------------------------------------------
    console.log('\n[TEST 2] Unpaid appointment creation');
    const appt2 = await Appointment.create({
      tenantId: testTenant,
      patientId: patient._id,
      doctorId: testDoctorId,
      date: new Date(),
      time: '11:00 AM',
      reason: 'General Checkup',
      paymentStatus: 'Pending',
      status: 'Pending Approval'
    });

    const bill2 = new Billing({
      tenantId: testTenant,
      patientId: patient._id,
      appointmentId: appt2._id,
      totalAmount: 1000,
      status: 'Unpaid'
    });
    await bill2.save();

    assert(bill2.status === 'Unpaid', 'Bill status is Unpaid');
    assert(bill2.amountPaid === 0, 'Bill amountPaid is 0');
    assert(bill2.balanceDue === 1000, 'Bill balanceDue is 1000');
    assert(bill2.payments.length === 0, 'Bill has 0 payment entries');

    // -------------------------------------------------------------
    // Test Case 3: Single Full Payment Collection at Counter (e.g., Cash 1000)
    // -------------------------------------------------------------
    console.log('\n[TEST 3] Single payment collection at Counter (Cash 1000)');
    bill2.payments.push({
      paymentId: 'PAY-CSH-1',
      amount: 1000,
      method: 'Cash',
      source: 'Counter',
      recordedBy: 'staff_101',
      recordedByName: 'Receptionist Sunita',
      recordedAt: new Date()
    });
    await bill2.save();

    assert(bill2.status === 'Paid', 'Bill 2 status is now Paid');
    assert(bill2.amountPaid === 1000, 'Bill 2 amountPaid is 1000');
    assert(bill2.balanceDue === 0, 'Bill 2 balanceDue is 0');

    // -------------------------------------------------------------
    // Test Case 4: Partial Payment at Counter (500 paid out of 1000)
    // -------------------------------------------------------------
    console.log('\n[TEST 4] Partial payment collection (500 / 1000)');
    const appt3 = await Appointment.create({
      tenantId: testTenant,
      patientId: patient._id,
      doctorId: testDoctorId,
      date: new Date(),
      time: '12:00 PM',
      reason: 'Fever check',
      paymentStatus: 'Pending',
      status: 'Confirmed'
    });

    const bill3 = new Billing({
      tenantId: testTenant,
      patientId: patient._id,
      appointmentId: appt3._id,
      totalAmount: 1000,
      status: 'Unpaid'
    });
    await bill3.save();

    bill3.payments.push({
      paymentId: 'PAY-PARTIAL-1',
      amount: 500,
      method: 'Cash',
      source: 'Counter',
      recordedBy: 'staff_101',
      recordedByName: 'Receptionist Sunita',
      recordedAt: new Date()
    });
    await bill3.save();

    assert(bill3.status === 'Partially Paid', 'Bill 3 status is Partially Paid');
    assert(bill3.amountPaid === 500, 'Bill 3 amountPaid is 500');
    assert(bill3.balanceDue === 500, 'Bill 3 balanceDue is 500');

    // -------------------------------------------------------------
    // Test Case 5: Sequential Payment to settle remainder (Remaining 500 via UPI)
    // -------------------------------------------------------------
    console.log('\n[TEST 5] Settle remaining 500 via UPI');
    bill3.payments.push({
      paymentId: 'PAY-PARTIAL-2',
      amount: 500,
      method: 'UPI',
      source: 'Counter',
      transactionRef: 'UPI_TXN_987654',
      recordedBy: 'staff_101',
      recordedByName: 'Receptionist Sunita',
      recordedAt: new Date()
    });
    await bill3.save();

    assert(bill3.status === 'Paid', 'Bill 3 is now fully Paid after second installment');
    assert(bill3.amountPaid === 1000, 'Bill 3 amountPaid is 1000');
    assert(bill3.balanceDue === 0, 'Bill 3 balanceDue is 0');
    assert(bill3.payments.length === 2, 'Bill 3 has exactly 2 payment entries');

    // -------------------------------------------------------------
    // Test Case 6: Split Payment (Cash 500 + UPI 500 in single transaction)
    // -------------------------------------------------------------
    console.log('\n[TEST 6] Split payment Cash + UPI at once');
    const bill4 = new Billing({
      tenantId: testTenant,
      patientId: patient._id,
      totalAmount: 1000,
      status: 'Unpaid',
      payments: [
        {
          paymentId: 'PAY-SPLIT-1',
          amount: 500,
          method: 'Cash',
          source: 'Counter',
          recordedBy: 'staff_101',
          recordedByName: 'Receptionist Sunita',
          recordedAt: new Date()
        },
        {
          paymentId: 'PAY-SPLIT-2',
          amount: 500,
          method: 'UPI',
          source: 'Counter',
          transactionRef: 'UPI_SPLIT_001',
          recordedBy: 'staff_101',
          recordedByName: 'Receptionist Sunita',
          recordedAt: new Date()
        }
      ]
    });
    await bill4.save();

    assert(bill4.status === 'Paid', 'Split bill status is Paid');
    assert(bill4.amountPaid === 1000, 'Split bill amountPaid is 1000');
    assert(bill4.balanceDue === 0, 'Split bill balanceDue is 0');
    assert(bill4.payments.length === 2, 'Split bill contains 2 payment entries');

    // -------------------------------------------------------------
    // Test Case 7: Multi-Split Payment (Cash 400 + UPI 300 + Card 300 = 1000)
    // -------------------------------------------------------------
    console.log('\n[TEST 7] Multi-Split payment (Cash + UPI + Card)');
    const bill5 = new Billing({
      tenantId: testTenant,
      patientId: patient._id,
      totalAmount: 1000,
      status: 'Unpaid',
      payments: [
        { paymentId: 'P1', amount: 400, method: 'Cash', source: 'Counter' },
        { paymentId: 'P2', amount: 300, method: 'UPI', source: 'Counter' },
        { paymentId: 'P3', amount: 300, method: 'Card', source: 'Counter' }
      ]
    });
    await bill5.save();

    assert(bill5.status === 'Paid', 'Multi-split bill status is Paid');
    assert(bill5.amountPaid === 1000, 'Multi-split bill amountPaid is 1000');
    assert(bill5.balanceDue === 0, 'Multi-split bill balanceDue is 0');
    assert(bill5.payments.length === 3, 'Multi-split bill has 3 payments');

    // -------------------------------------------------------------
    // Test Case 8: Overpayment calculation protection in pre-save hook
    // -------------------------------------------------------------
    console.log('\n[TEST 8] Overpayment check (pre-save hook bounds balanceDue to 0)');
    const bill6 = new Billing({
      tenantId: testTenant,
      patientId: patient._id,
      totalAmount: 1000,
      status: 'Unpaid',
      payments: [
        { paymentId: 'P-OVER', amount: 1200, method: 'Cash', source: 'Counter' }
      ]
    });
    await bill6.save();
    assert(bill6.balanceDue === 0, 'balanceDue never goes below 0 on overpayment');
    assert(bill6.amountPaid === 1200, 'amountPaid reflects sum correctly');
    assert(bill6.status === 'Paid', 'Status is Paid when amountPaid >= totalAmount');

    // -------------------------------------------------------------
    // Test Case 9: Appointment paymentStatus enum validation
    // -------------------------------------------------------------
    console.log('\n[TEST 9] Appointment paymentStatus enum supports Partially Paid');
    const appt4 = new Appointment({
      tenantId: testTenant,
      patientId: patient._id,
      doctorId: testDoctorId,
      date: new Date(),
      time: '02:00 PM',
      reason: 'Follow-up',
      paymentStatus: 'Partially Paid',
      status: 'Confirmed'
    });
    await appt4.save();
    assert(appt4.paymentStatus === 'Partially Paid', 'Appointment saved with paymentStatus: Partially Paid without enum error');

    // -------------------------------------------------------------
    // Test Case 10: Backward Compatibility for Legacy Paid Bills without payments array
    // -------------------------------------------------------------
    console.log('\n[TEST 10] Legacy bill with status Paid and no payments array');
    const legacyBill = new Billing({
      tenantId: testTenant,
      patientId: patient._id,
      totalAmount: 800,
      status: 'Paid',
      paymentMethod: 'Cash'
    });
    await legacyBill.save();
    assert(legacyBill.amountPaid === 800, 'Legacy bill amountPaid defaults to totalAmount when status is Paid');
    assert(legacyBill.balanceDue === 0, 'Legacy bill balanceDue is 0');

    // -------------------------------------------------------------
    // Test Case 11: Tenant Isolation Verification
    // -------------------------------------------------------------
    console.log('\n[TEST 11] Tenant Isolation');
    const otherTenantBill = await Billing.create({
      tenantId: 'other_tenant_xyz',
      patientId: patient._id,
      totalAmount: 500,
      status: 'Unpaid'
    });
    const foundInThisTenant = await Billing.find({ tenantId: testTenant });
    const foundOther = foundInThisTenant.some(b => b._id.toString() === otherTenantBill._id.toString());
    assert(!foundOther, 'Queries for testTenant do not leak records from other tenants');

    // -------------------------------------------------------------
    // Test Case 12: Audit Log Integration
    // -------------------------------------------------------------
    console.log('\n[TEST 12] Audit Log Creation for Payment Collection');
    const auditEntry = await AuditLog.create({
      tenantId: testTenant,
      actor: 'staff_101',
      actorName: 'Receptionist Sunita',
      actorRole: 'receptionist',
      action: 'payment_collected',
      target: String(bill4._id),
      metadata: {
        totalPaid: bill4.amountPaid,
        balanceDue: bill4.balanceDue,
        status: bill4.status
      }
    });
    assert(auditEntry._id && auditEntry.action === 'payment_collected', 'AuditLog record successfully created with action payment_collected');

    // -------------------------------------------------------------
    // Cleanup test records
    // -------------------------------------------------------------
    console.log('\n[CLEANUP] Removing test artifacts');
    await Billing.deleteMany({ tenantId: { $in: [testTenant, 'other_tenant_xyz'] } });
    await Appointment.deleteMany({ tenantId: testTenant });
    await Patient.deleteMany({ tenantId: testTenant });
    await AuditLog.deleteMany({ tenantId: testTenant });
    console.log('✅ Cleanup complete.');

  } catch (err) {
    console.error('❌ Exception during tests:', err);
    failedCount++;
  } finally {
    await mongoose.disconnect();
    console.log(`\n=============================================`);
    console.log(`TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log(`=============================================\n`);
    process.exit(failedCount > 0 ? 1 : 0);
  }
}

runTests();
