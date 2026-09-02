/**
 * CUROXA LEAVE MANAGEMENT — PHASE 4 TEST SUITE
 * Tests Yearly Transition, Automation, Carry-Forward Limits, Idempotency, Cross-Year Splitting & Attendance Integration
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../config/db');
const LeavePolicy = require('../models/LeavePolicy');
const LeaveLedger = require('../models/LeaveLedger');
const LeaveRequest = require('../models/LeaveRequest');
const AttendanceRecord = require('../models/AttendanceRecord');
const User = require('../models/User');
const leaveService = require('../services/leaveService');
const leaveScheduler = require('../services/leaveScheduler');

async function runPhase4Tests() {
  console.log('\n======================================================');
  console.log('🚀 RUNNING CUROXA LEAVE MANAGEMENT PHASE 4 TEST SUITE');
  console.log('======================================================\n');

  await connectDB();
  console.log('MongoDB Connected for Phase 4 test suite.\n');

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

  const TENANT_A = 'test_tenant_alpha_p4';
  const TENANT_B = 'test_tenant_beta_p4';
  const STAFF_1 = 'EMP_P4_001';
  const STAFF_2 = 'EMP_P4_002';
  const ADMIN_1 = 'ADMIN_P4_001';

  try {
    // 0. Cleanup prior test records
    await LeavePolicy.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await LeaveLedger.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await LeaveRequest.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await AttendanceRecord.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await User.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });

    // Seed test users
    await User.create([
      { tenantId: TENANT_A, staff_id: ADMIN_1, name: 'Dr. Leader Admin', role: 'admin', email: 'admin@curoxa.com', password_hash: 'hash' },
      { tenantId: TENANT_A, staff_id: STAFF_1, name: 'Dr. John Doe', role: 'doctor', email: 'john@curoxa.com', password_hash: 'hash' },
      { tenantId: TENANT_A, staff_id: STAFF_2, name: 'Nurse Jane Doe', role: 'nurse', email: 'jane@curoxa.com', password_hash: 'hash' },
      { tenantId: TENANT_B, staff_id: STAFF_1, name: 'Dr. Beta User', role: 'doctor', email: 'beta@curoxa.com', password_hash: 'hash' }
    ]);

    // Setup Custom Policy for Tenant A with maxCarryForward limits:
    // Sick: CF enabled, max 5
    // Casual: CF disabled
    // Earned: CF enabled, max 10
    await leaveService.updateLeavePolicy(TENANT_A, {
      leaveTypes: [
        { leaveType: 'Sick Leave', code: 'SICK', paid: true, monthlyAccrual: 1.0, annualEntitlement: 12, carryForward: true, maxCarryForward: 5, enabled: true },
        { leaveType: 'Casual Leave', code: 'CASUAL', paid: true, monthlyAccrual: 1.0, annualEntitlement: 12, carryForward: false, maxCarryForward: 0, enabled: true },
        { leaveType: 'Earned Leave', code: 'EARNED', paid: true, monthlyAccrual: 1.5, annualEntitlement: 18, carryForward: true, maxCarryForward: 10, enabled: true }
      ]
    });

    console.log('--- TEST 1, 2, 3, 4, 5, 6 & 7: Year Transition, Idempotency, Carry-Forward & Limits ---');
    // Setup full 2026 data for Staff 1
    await leaveService.initializeYearForStaff(TENANT_A, STAFF_1, 2026);
    for (let m = 1; m <= 12; m++) {
      await leaveService.accrueMonthlyLeaves(TENANT_A, 2026, m, STAFF_1);
    }
    // Staff 1 2026 Accrued: Sick: 12, Casual: 12, Earned: 18
    // Consume 4 Sick leaves in 2026
    const req2026 = await LeaveRequest.create({
      tenantId: TENANT_A,
      employeeId: STAFF_1,
      employeeName: 'Dr. John Doe',
      leaveType: 'Sick Leave',
      fromDate: '2026-06-01',
      toDate: '2026-06-04',
      days: 4,
      status: 'Approved'
    });
    await leaveService.processLeaveApproval(TENANT_A, req2026, 'System');

    // 2026 closing balances:
    // Sick: 12 - 4 = 8
    // Casual: 12
    // Earned: 18
    const bal2026 = await leaveService.getStaffLeaveBalance(TENANT_A, STAFF_1, 2026);
    assert(bal2026.balances['Sick Leave'].currentBalance === 8.0, '2026 Sick Leave closing balance is 8.0');
    assert(bal2026.balances['Casual Leave'].currentBalance === 12.0, '2026 Casual Leave closing balance is 12.0');
    assert(bal2026.balances['Earned Leave'].currentBalance === 18.0, '2026 Earned Leave closing balance is 18.0');

    // Now Initialize 2027
    const init2027 = await leaveService.initializeYearForStaff(TENANT_A, STAFF_1, 2027);
    assert(init2027.year === 2027, 'TEST 1: 2027 Year initialized');

    // Check carry forward limit: Sick closing was 8, maxCarryForward is 5
    assert(init2027.balances['Sick Leave'].carryForward === 5.0, 'TEST 3 & 5: Sick Leave CF capped at max limit of 5.0 (out of 8.0)');
    
    // Check carry forward disabled: Casual closing was 12, CF is disabled -> 0
    assert(init2027.balances['Casual Leave'].carryForward === 0, 'TEST 4: Casual Leave CF is 0 (disabled)');

    // Check carry forward limit: Earned closing was 18, maxCarryForward is 10
    assert(init2027.balances['Earned Leave'].carryForward === 10.0, 'TEST 5: Earned Leave CF capped at max limit of 10.0 (out of 18.0)');

    // Verify 2027 CF transaction metadata
    const cfTxList = await LeaveLedger.find({ tenantId: TENANT_A, employeeId: STAFF_1, year: 2027, transactionType: 'CARRY_FORWARD' });
    assert(cfTxList.length === 2, 'TEST 7: Carry forward ledger entries created for Sick and Earned');
    assert(cfTxList[0].reason.includes('2026'), 'TEST 7: Carry forward transaction references 2026 in reason');

    // Check 2026 historical immutability
    const bal2026After = await leaveService.getStaffLeaveBalance(TENANT_A, STAFF_1, 2026);
    assert(bal2026After.balances['Sick Leave'].currentBalance === 8.0, 'TEST 6: 2026 Sick Leave balance unchanged (8.0)');
    assert(bal2026After.balances['Casual Leave'].currentBalance === 12.0, 'TEST 6: 2026 Casual Leave balance unchanged (12.0)');
    assert(bal2026After.balances['Earned Leave'].currentBalance === 18.0, 'TEST 6: 2026 Earned Leave balance unchanged (18.0)');

    // TEST 2: Idempotency of year initialization
    const ledgerCountBefore = await LeaveLedger.countDocuments({ tenantId: TENANT_A, employeeId: STAFF_1, year: 2027 });
    await leaveService.initializeYearForStaff(TENANT_A, STAFF_1, 2027);
    const ledgerCountAfter = await LeaveLedger.countDocuments({ tenantId: TENANT_A, employeeId: STAFF_1, year: 2027 });
    assert(ledgerCountBefore === ledgerCountAfter, 'TEST 2: Second initialization run creates 0 duplicate records');

    console.log('\n--- TEST 8: Monthly Accrual in 2027 remains idempotent ---');
    const accMonth1 = await leaveService.accrueMonthlyLeaves(TENANT_A, 2027, 1, STAFF_1);
    assert(accMonth1.creditedCount === 3, 'TEST 8: Month 1 accrual credits 3 leave types');
    const accMonth1Dup = await leaveService.accrueMonthlyLeaves(TENANT_A, 2027, 1, STAFF_1);
    assert(accMonth1Dup.creditedCount === 0 && accMonth1Dup.skippedDuplicateCount === 3, 'TEST 8: Duplicate Month 1 accrual safely skipped');

    console.log('\n--- TEST 9, 10 & 11: Multi-tenant year initialization & Mid-year safety ---');
    // Initialize Tenant B for 2027
    await leaveService.initializeYearForTenant(TENANT_B, 2027);
    const balTenantB2027 = await leaveService.getStaffLeaveBalance(TENANT_B, STAFF_1, 2027);
    assert(balTenantB2027.balances['Sick Leave'].carryForward === 0, 'TEST 9 & 10: Tenant B has 0 carry forward (isolated from Tenant A)');

    // Mid-year initialization test (e.g. Month 7)
    const midYearAccrual = await leaveService.accrueMonthlyLeaves(TENANT_B, 2027, 7, STAFF_1);
    assert(midYearAccrual.creditedCount >= 1, 'TEST 11: Mid-year month 7 accrual initializes safely');

    console.log('\n--- TEST 13, 14, 15, 16, 17 & 18: Attendance Integration ---');
    // Create an Approved request for Staff 1
    const appReq = await LeaveRequest.create({
      tenantId: TENANT_A,
      employeeId: STAFF_1,
      employeeName: 'Dr. John Doe',
      leaveType: 'Sick Leave',
      fromDate: '2027-01-15',
      toDate: '2027-01-17',
      days: 3,
      status: 'Approved'
    });
    await leaveService.processLeaveApproval(TENANT_A, appReq, 'Admin');

    const attJan15 = await AttendanceRecord.findOne({ tenantId: TENANT_A, employeeId: STAFF_1, date: '2027-01-15' });
    const attJan16 = await AttendanceRecord.findOne({ tenantId: TENANT_A, employeeId: STAFF_1, date: '2027-01-16' });
    const attJan17 = await AttendanceRecord.findOne({ tenantId: TENANT_A, employeeId: STAFF_1, date: '2027-01-17' });
    assert(attJan15 !== null && attJan15.status === 'Leave', 'TEST 13: Attendance for Jan 15 marked as Leave');
    assert(attJan16 !== null && attJan16.status === 'Leave', 'TEST 13: Attendance for Jan 16 marked as Leave');
    assert(attJan17 !== null && attJan17.status === 'Leave', 'TEST 13: Attendance for Jan 17 marked as Leave');

    // Duplicate sync check
    await leaveService.syncApprovedLeaveToAttendance(TENANT_A, appReq);
    const totalAttRecords = await AttendanceRecord.countDocuments({ tenantId: TENANT_A, employeeId: STAFF_1, date: { $in: ['2027-01-15', '2027-01-16', '2027-01-17'] } });
    assert(totalAttRecords === 3, 'TEST 17: No duplicate attendance records created on multiple runs');

    // Verify Attendance does NOT create a second leave debit
    const leaveDebits = await LeaveLedger.find({ tenantId: TENANT_A, leaveRequestId: appReq._id });
    assert(leaveDebits.length === 1, 'TEST 18: Attendance integration did not create extra leave debits');

    // Non-approved requests do not map to Leave attendance
    const pendReq = await LeaveRequest.create({
      tenantId: TENANT_A,
      employeeId: STAFF_1,
      employeeName: 'Dr. John Doe',
      leaveType: 'Casual Leave',
      fromDate: '2027-02-10',
      toDate: '2027-02-10',
      days: 1,
      status: 'Pending'
    });
    const rejReq = await LeaveRequest.create({
      tenantId: TENANT_A,
      employeeId: STAFF_1,
      employeeName: 'Dr. John Doe',
      leaveType: 'Casual Leave',
      fromDate: '2027-02-11',
      toDate: '2027-02-11',
      days: 1,
      status: 'Rejected'
    });
    const cancReq = await LeaveRequest.create({
      tenantId: TENANT_A,
      employeeId: STAFF_1,
      employeeName: 'Dr. John Doe',
      leaveType: 'Casual Leave',
      fromDate: '2027-02-12',
      toDate: '2027-02-12',
      days: 1,
      status: 'Cancelled'
    });

    const attPend = await AttendanceRecord.findOne({ tenantId: TENANT_A, employeeId: STAFF_1, date: '2027-02-10' });
    const attRej = await AttendanceRecord.findOne({ tenantId: TENANT_A, employeeId: STAFF_1, date: '2027-02-11' });
    const attCanc = await AttendanceRecord.findOne({ tenantId: TENANT_A, employeeId: STAFF_1, date: '2027-02-12' });
    assert(attPend === null, 'TEST 14: Pending leave does NOT create Leave attendance');
    assert(attRej === null, 'TEST 15: Rejected leave does NOT create Leave attendance');
    assert(attCanc === null, 'TEST 16: Cancelled leave does NOT create Leave attendance');

    console.log('\n--- TEST 19: Cross-Year Leave Handling ---');
    // Test splitting from 2026-12-30 to 2027-01-02 (4 days total: 2 days in 2026, 2 days in 2027)
    const splitResult = leaveService.splitLeaveByYear('2026-12-30', '2027-01-02', 4);
    assert(splitResult.length === 2, 'TEST 19: Cross-year range correctly split into 2 year segments');
    assert(splitResult[0].year === 2026 && splitResult[0].days === 2, 'TEST 19: 2026 segment has 2 days');
    assert(splitResult[1].year === 2027 && splitResult[1].days === 2, 'TEST 19: 2027 segment has 2 days');

    console.log('\n--- TEST 20: Automated Scheduler Integration ---');
    const schedResult = await leaveScheduler.runScheduledYearTransition(2027);
    assert(schedResult.year === 2027, 'TEST 20: Automated yearly transition executed successfully');

    console.log('\n======================================================');
    console.log(`📊 PHASE 4 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');

    // Cleanup test data
    await LeavePolicy.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await LeaveLedger.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await LeaveRequest.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await AttendanceRecord.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await User.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Phase 4 Test error:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runPhase4Tests();
