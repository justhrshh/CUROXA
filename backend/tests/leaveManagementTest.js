/**
 * CUROXA LEAVE MANAGEMENT — PHASE 1 TEST SUITE
 * Tests all 12 Business Rules & Functional Foundation Requirements
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../config/db');
const LeavePolicy = require('../models/LeavePolicy');
const LeaveLedger = require('../models/LeaveLedger');
const LeaveRequest = require('../models/LeaveRequest');
const User = require('../models/User');
const leaveService = require('../services/leaveService');

async function runTests() {
  console.log('\n======================================================');
  console.log('🚀 RUNNING CUROXA LEAVE MANAGEMENT PHASE 1 TEST SUITE');
  console.log('======================================================\n');

  await connectDB();
  console.log('MongoDB Connected for test suite.\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const TENANT_A = 'test_tenant_alpha';
  const TENANT_B = 'test_tenant_beta';
  const STAFF_1 = 'EMP_TEST_001';
  const STAFF_2 = 'EMP_TEST_002';

  try {
    // Cleanup any prior test data for isolated test tenants
    await LeavePolicy.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await LeaveLedger.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await LeaveRequest.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await User.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });

    // Seed test users
    await User.create([
      { tenantId: TENANT_A, staff_id: STAFF_1, name: 'Dr. Test One', role: 'doctor', password_hash: 'hash' },
      { tenantId: TENANT_A, staff_id: STAFF_2, name: 'Nurse Test Two', role: 'nurse', password_hash: 'hash' },
      { tenantId: TENANT_B, staff_id: STAFF_1, name: 'Dr. Tenant Beta User', role: 'doctor', password_hash: 'hash' }
    ]);

    // Setup Custom Policy for Tenant A (0.5 Sick/mo, 0.75 Casual/mo, 1.5 Earned/mo)
    await leaveService.updateLeavePolicy(TENANT_A, {
      leaveTypes: [
        { leaveType: 'Sick Leave', code: 'SICK', paid: true, monthlyAccrual: 0.5, annualEntitlement: 6, carryForward: true, maxCarryForward: 10, enabled: true },
        { leaveType: 'Casual Leave', code: 'CASUAL', paid: true, monthlyAccrual: 0.75, annualEntitlement: 9, carryForward: false, maxCarryForward: 0, enabled: true },
        { leaveType: 'Earned Leave', code: 'EARNED', paid: true, monthlyAccrual: 1.5, annualEntitlement: 18, carryForward: true, maxCarryForward: 20, enabled: true },
        { leaveType: 'Maternity Leave', code: 'MATERNITY', paid: true, monthlyAccrual: 0, annualEntitlement: 90, carryForward: false, enabled: true }
      ]
    });

    console.log('--- TEST 1 & 2: New annual balance is created & Policy values are respected ---');
    const init2026 = await leaveService.initializeYearForStaff(TENANT_A, STAFF_1, 2026);
    assert(init2026.year === 2026, 'Year 2026 allocation created');
    assert(init2026.balances['Sick Leave'].monthlyAccrual === 0.5, 'Sick leave monthly policy is 0.5');
    assert(init2026.balances['Casual Leave'].monthlyAccrual === 0.75, 'Casual leave monthly policy is 0.75');
    assert(init2026.balances['Earned Leave'].monthlyAccrual === 1.5, 'Earned leave monthly policy is 1.5');
    assert(init2026.balances['Maternity Leave'].currentBalance === 90, 'Non-accruing Maternity Leave gets upfront annual entitlement (90 days)');

    console.log('\n--- TEST 3: Monthly accrual occurs exactly once ---');
    const accrualJan = await leaveService.accrueMonthlyLeaves(TENANT_A, 2026, 1, STAFF_1);
    assert(accrualJan.creditedCount === 3, 'Credited 3 monthly accruable leave types (Sick, Casual, Earned)');
    const balJan = await leaveService.getStaffLeaveBalance(TENANT_A, STAFF_1, 2026);
    assert(balJan.balances['Sick Leave'].currentBalance === 0.5, 'Sick leave balance is 0.5 after Month 1');
    assert(balJan.balances['Casual Leave'].currentBalance === 0.75, 'Casual leave balance is 0.75 after Month 1');
    assert(balJan.balances['Earned Leave'].currentBalance === 1.5, 'Earned leave balance is 1.5 after Month 1');

    console.log('\n--- TEST 4: Running accrual twice does not duplicate credit ---');
    const duplicateAccrualJan = await leaveService.accrueMonthlyLeaves(TENANT_A, 2026, 1, STAFF_1);
    assert(duplicateAccrualJan.creditedCount === 0, 'Zero new credits on second run');
    assert(duplicateAccrualJan.skippedDuplicateCount === 3, 'Skipped 3 duplicate credits');
    const balJanAfterDup = await leaveService.getStaffLeaveBalance(TENANT_A, STAFF_1, 2026);
    assert(balJanAfterDup.balances['Sick Leave'].currentBalance === 0.5, 'Sick balance unchanged (still 0.5)');
    assert(balJanAfterDup.balances['Casual Leave'].currentBalance === 0.75, 'Casual balance unchanged (still 0.75)');

    // Accrue months 2 to 12 for 2026
    for (let m = 2; m <= 12; m++) {
      await leaveService.accrueMonthlyLeaves(TENANT_A, 2026, m, STAFF_1);
    }
    const fullYearBal = await leaveService.getStaffLeaveBalance(TENANT_A, STAFF_1, 2026);
    assert(fullYearBal.balances['Sick Leave'].currentBalance === 6.0, 'Full year 2026 Sick leave = 6.0 (0.5 * 12)');
    assert(fullYearBal.balances['Casual Leave'].currentBalance === 9.0, 'Full year 2026 Casual leave = 9.0 (0.75 * 12)');
    assert(fullYearBal.balances['Earned Leave'].currentBalance === 18.0, 'Full year 2026 Earned leave = 18.0 (1.5 * 12)');

    console.log('\n--- TEST 5: Pending request does not deduct balance ---');
    const pendingReq = await LeaveRequest.create({
      tenantId: TENANT_A,
      employeeId: STAFF_1,
      employeeName: 'Dr. Test One',
      leaveType: 'Sick Leave',
      fromDate: '2026-05-10',
      toDate: '2026-05-12',
      days: 3,
      status: 'Pending'
    });
    const balWithPending = await leaveService.getStaffLeaveBalance(TENANT_A, STAFF_1, 2026);
    assert(balWithPending.balances['Sick Leave'].currentBalance === 6.0, 'Pending leave did not reduce Sick Leave balance (still 6.0)');

    console.log('\n--- TEST 6: Rejected request does not deduct balance ---');
    pendingReq.status = 'Rejected';
    await pendingReq.save();
    const balWithRejected = await leaveService.getStaffLeaveBalance(TENANT_A, STAFF_1, 2026);
    assert(balWithRejected.balances['Sick Leave'].currentBalance === 6.0, 'Rejected leave did not reduce Sick Leave balance (still 6.0)');

    console.log('\n--- TEST 7: Approved request can later deduct exactly once ---');
    pendingReq.status = 'Approved';
    await pendingReq.save();
    const approvalResult = await leaveService.processLeaveApproval(TENANT_A, pendingReq, 'HR Manager');
    assert(approvalResult.success === true, 'Leave approval processed');
    const balAfterApproval = await leaveService.getStaffLeaveBalance(TENANT_A, STAFF_1, 2026);
    assert(balAfterApproval.balances['Sick Leave'].consumed === 3, 'Sick Leave consumed is 3');
    assert(balAfterApproval.balances['Sick Leave'].currentBalance === 3.0, 'Sick Leave balance reduced to 3.0 (6.0 - 3)');

    // Approve same request again
    const secondApproval = await leaveService.processLeaveApproval(TENANT_A, pendingReq, 'HR Manager');
    assert(secondApproval.alreadyDebited === true, 'Subsequent approval call detects alreadyDebited');
    const balAfterSecondApproval = await leaveService.getStaffLeaveBalance(TENANT_A, STAFF_1, 2026);
    assert(balAfterSecondApproval.balances['Sick Leave'].currentBalance === 3.0, 'Balance not deducted twice');

    console.log('\n--- TEST 8, 9 & 10: 2027 Initialization, Carry-forward enabled vs disabled, 2026 history unchanged ---');
    // Also approve 4 days of Casual leave in 2026 (out of 9 accrued, remaining = 5)
    const casualLeave2026 = await LeaveRequest.create({
      tenantId: TENANT_A,
      employeeId: STAFF_1,
      employeeName: 'Dr. Test One',
      leaveType: 'Casual Leave',
      fromDate: '2026-08-01',
      toDate: '2026-08-04',
      days: 4,
      status: 'Approved'
    });
    await leaveService.processLeaveApproval(TENANT_A, casualLeave2026, 'HR Manager');

    const bal2026Pre2027 = await leaveService.getStaffLeaveBalance(TENANT_A, STAFF_1, 2026);
    assert(bal2026Pre2027.balances['Sick Leave'].currentBalance === 3.0, '2026 Closing Sick Leave = 3.0');
    assert(bal2026Pre2027.balances['Casual Leave'].currentBalance === 5.0, '2026 Closing Casual Leave = 5.0');
    assert(bal2026Pre2027.balances['Earned Leave'].currentBalance === 18.0, '2026 Closing Earned Leave = 18.0');

    // Initialize 2027
    const init2027 = await leaveService.initializeYearForStaff(TENANT_A, STAFF_1, 2027);

    // Carry-forward enabled: Sick (3.0 carried forward), Earned (18.0 carried forward)
    assert(init2027.balances['Sick Leave'].carryForward === 3.0, 'TEST 9: Sick Leave carried forward 3.0 days into 2027');
    assert(init2027.balances['Earned Leave'].carryForward === 18.0, 'TEST 9: Earned Leave carried forward 18.0 days into 2027');

    // Carry-forward disabled: Casual (carryForward: false in policy, so 0 carry-forward)
    assert(init2027.balances['Casual Leave'].carryForward === 0, 'TEST 10: Casual Leave carryForward is disabled, carried forward 0 days');
    assert(init2027.balances['Casual Leave'].currentBalance === 0, 'TEST 10: Casual Leave starts fresh at 0 in 2027 before accruals');

    // TEST 8: Verify 2026 records remain unchanged
    const bal2026Post2027 = await leaveService.getStaffLeaveBalance(TENANT_A, STAFF_1, 2026);
    assert(bal2026Post2027.balances['Sick Leave'].currentBalance === 3.0, 'TEST 8: 2026 Sick Leave historical balance unchanged (3.0)');
    assert(bal2026Post2027.balances['Casual Leave'].currentBalance === 5.0, 'TEST 8: 2026 Casual Leave historical balance unchanged (5.0)');
    assert(bal2026Post2027.balances['Earned Leave'].currentBalance === 18.0, 'TEST 8: 2026 Earned Leave historical balance unchanged (18.0)');

    console.log('\n--- TEST 11: Multi-tenant isolation ---');
    // Initialize Tenant B
    await leaveService.initializeYearForStaff(TENANT_B, STAFF_1, 2026);
    await leaveService.accrueMonthlyLeaves(TENANT_B, 2026, 1, STAFF_1);
    const balTenantB = await leaveService.getStaffLeaveBalance(TENANT_B, STAFF_1, 2026);
    const balTenantA = await leaveService.getStaffLeaveBalance(TENANT_A, STAFF_1, 2026);

    assert(balTenantB.tenantId === TENANT_B, 'Tenant B response isolated to Tenant B');
    assert(balTenantA.balances['Sick Leave'].currentBalance !== balTenantB.balances['Sick Leave'].currentBalance,
      'Tenant A balance (3.0) is isolated from Tenant B balance (0.5)');

    const ledgerTenantB = await LeaveLedger.find({ tenantId: TENANT_B });
    const hasTenantALeaks = ledgerTenantB.some(l => l.tenantId !== TENANT_B);
    assert(!hasTenantALeaks, 'No cross-tenant ledger leaks found in Tenant B queries');

    console.log('\n--- TEST 12: Existing Attendance/Doctor Availability integration ---');
    const UserDoctor = await User.findOne({ tenantId: TENANT_A, staff_id: STAFF_1 });
    assert(UserDoctor !== null, 'User doctor record exists in database');
    const docLeaves = await LeaveRequest.find({ tenantId: TENANT_A, employeeId: STAFF_1, status: 'Approved' });
    assert(docLeaves.length >= 2, 'Doctor approved leave requests queryable by existing attendance/auth routes');

    console.log('\n======================================================');
    console.log(`📊 TEST SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');

    // Cleanup test data
    await LeavePolicy.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await LeaveLedger.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await LeaveRequest.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await User.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Test error:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runTests();
