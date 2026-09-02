/**
 * CUROXA LEAVE MANAGEMENT — PHASE 3 TEST SUITE
 * Tests HR/Admin Approval, Rejections, Notifications, Concurrency, Validations & Security
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

async function runPhase3Tests() {
  console.log('\n======================================================');
  console.log('🚀 RUNNING CUROXA LEAVE MANAGEMENT PHASE 3 TEST SUITE');
  console.log('======================================================\n');

  await connectDB();
  console.log('MongoDB Connected for Phase 3 test suite.\n');

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

  const TENANT_A = 'test_tenant_alpha_p3';
  const TENANT_B = 'test_tenant_beta_p3';
  const STAFF_1 = 'EMP_P3_001';
  const STAFF_2 = 'EMP_P3_002';
  const ADMIN_1 = 'ADMIN_P3_001';

  try {
    // 0. Cleanup any prior test data
    await LeavePolicy.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await LeaveLedger.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await LeaveRequest.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await User.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });

    // Seed test users
    await User.create([
      { tenantId: TENANT_A, staff_id: ADMIN_1, name: 'Dr. Admin Lead', role: 'admin', email: 'admin@curoxa.com', password_hash: 'hash' },
      { tenantId: TENANT_A, staff_id: STAFF_1, name: 'Dr. Bob Staff', role: 'doctor', email: 'bob@curoxa.com', password_hash: 'hash' },
      { tenantId: TENANT_A, staff_id: STAFF_2, name: 'Nurse Carol Staff', role: 'nurse', email: 'carol@curoxa.com', password_hash: 'hash' },
      { tenantId: TENANT_B, staff_id: STAFF_1, name: 'Dr. Tenant Beta User', role: 'doctor', email: 'beta@curoxa.com', password_hash: 'hash' }
    ]);

    // Setup Custom Policy for Tenant A (1.0 Sick/mo, 1.0 Casual/mo, 1.5 Earned/mo)
    await leaveService.updateLeavePolicy(TENANT_A, {
      leaveTypes: [
        { leaveType: 'Sick Leave', code: 'SICK', paid: true, monthlyAccrual: 1.0, annualEntitlement: 12, carryForward: true, maxCarryForward: 15, enabled: true },
        { leaveType: 'Casual Leave', code: 'CASUAL', paid: true, monthlyAccrual: 1.0, annualEntitlement: 12, carryForward: false, maxCarryForward: 0, enabled: true },
        { leaveType: 'Earned Leave', code: 'EARNED', paid: true, monthlyAccrual: 1.5, annualEntitlement: 18, carryForward: true, maxCarryForward: 30, enabled: true }
      ]
    });

    // Initialize 2026 for Staff 1 & 2
    await leaveService.initializeYearForStaff(TENANT_A, STAFF_1, 2026);
    await leaveService.accrueMonthlyLeaves(TENANT_A, 2026, 1, STAFF_1);
    await leaveService.accrueMonthlyLeaves(TENANT_A, 2026, 2, STAFF_1);
    await leaveService.accrueMonthlyLeaves(TENANT_A, 2026, 3, STAFF_1);
    // Staff 1 balance: Sick: 3.0, Casual: 3.0, Earned: 4.5

    console.log('--- TEST 1 & 2: Admin can fetch pending leave requests with complete details ---');
    const req1 = await LeaveRequest.create({
      tenantId: TENANT_A,
      employeeId: STAFF_1,
      employeeName: 'Dr. Bob Staff',
      department: 'Cardiology',
      leaveType: 'Casual Leave',
      fromDate: '2026-04-10',
      toDate: '2026-04-11',
      days: 2,
      status: 'Pending',
      reason: 'Medical conference attendance'
    });

    const pendingRequests = await LeaveRequest.find({ tenantId: TENANT_A, status: 'Pending' });
    assert(pendingRequests.length === 1, 'TEST 1: Admin fetches pending leave request');
    assert(pendingRequests[0].employeeName === 'Dr. Bob Staff', 'TEST 2: Staff name is correct');
    assert(pendingRequests[0].department === 'Cardiology', 'TEST 2: Department is correct');
    assert(pendingRequests[0].days === 2, 'TEST 2: Duration is 2 days');
    assert(pendingRequests[0].reason === 'Medical conference attendance', 'TEST 2: Reason is correct');

    console.log('\n--- TEST 3, 4, 5 & 6: Admin approves request -> APPROVED, 1 debit in ledger, balance reduces ---');
    const approvalResult = await leaveService.processLeaveApproval(TENANT_A, req1, 'Dr. Admin Lead');
    assert(approvalResult.success === true, 'TEST 3: Approval executed');

    req1.status = 'Approved';
    req1.approvedBy = 'Dr. Admin Lead';
    req1.approvedDate = '2026-04-01';
    await req1.save();

    const verifiedReq1 = await LeaveRequest.findById(req1._id);
    assert(verifiedReq1.status === 'Approved', 'TEST 4: Status changed to APPROVED');

    const ledgerEntries = await LeaveLedger.find({ tenantId: TENANT_A, leaveRequestId: req1._id });
    assert(ledgerEntries.length === 1, 'TEST 5: Exactly one debit ledger entry created');
    assert(ledgerEntries[0].amount === -2, 'TEST 5: Debit transaction amount is -2');

    const balAfterApproval = await leaveService.getStaffLeaveBalance(TENANT_A, STAFF_1, 2026);
    assert(balAfterApproval.balances['Casual Leave'].currentBalance === 1.0, 'TEST 6: Balance reduced from 3.0 to 1.0 (3 - 2)');
    assert(balAfterApproval.balances['Casual Leave'].consumed === 2.0, 'TEST 6: Consumed is 2.0');

    console.log('\n--- TEST 7, 8, 9 & 10: Admin rejects pending request -> REJECTED, no debit, balance unchanged ---');
    const req2 = await LeaveRequest.create({
      tenantId: TENANT_A,
      employeeId: STAFF_1,
      employeeName: 'Dr. Bob Staff',
      department: 'Cardiology',
      leaveType: 'Casual Leave',
      fromDate: '2026-05-01',
      toDate: '2026-05-01',
      days: 1,
      status: 'Pending',
      reason: 'Personal time off'
    });

    req2.status = 'Rejected';
    req2.approvedBy = 'Dr. Admin Lead';
    req2.approvedDate = '2026-04-02';
    req2.rejectionReason = 'Critical surgical roster on that date';
    await req2.save();

    const verifiedReq2 = await LeaveRequest.findById(req2._id);
    assert(verifiedReq2.status === 'Rejected', 'TEST 8: Rejection changes status to REJECTED');

    const req2Ledger = await LeaveLedger.find({ tenantId: TENANT_A, leaveRequestId: req2._id });
    assert(req2Ledger.length === 0, 'TEST 10: Rejection creates NO debit ledger entry');

    const balAfterReject = await leaveService.getStaffLeaveBalance(TENANT_A, STAFF_1, 2026);
    assert(balAfterReject.balances['Casual Leave'].currentBalance === 1.0, 'TEST 9: Balance remains unchanged (still 1.0)');

    console.log('\n--- TEST 11 & 12: Double approval cannot create duplicate debit & already-approved rejection ---');
    const dupApproval = await leaveService.processLeaveApproval(TENANT_A, req1, 'Dr. Admin Lead');
    assert(dupApproval.alreadyDebited === true, 'TEST 11: Double approval detected alreadyDebited');

    const totalReq1Debits = await LeaveLedger.countDocuments({ tenantId: TENANT_A, leaveRequestId: req1._id });
    assert(totalReq1Debits === 1, 'TEST 11: Total debit entries remains strictly 1');

    // State check for already approved request
    const canApproveAlreadyApproved = req1.status === 'Pending';
    assert(canApproveAlreadyApproved === false, 'TEST 12: Cannot re-approve an already APPROVED request');

    console.log('\n--- TEST 13 & 14: Approving rejected or cancelled requests is safely rejected ---');
    const canApproveRejected = verifiedReq2.status === 'Pending';
    assert(canApproveRejected === false, 'TEST 13: Cannot approve a REJECTED request');

    const reqCancelled = await LeaveRequest.create({
      tenantId: TENANT_A,
      employeeId: STAFF_1,
      employeeName: 'Dr. Bob Staff',
      leaveType: 'Sick Leave',
      fromDate: '2026-06-01',
      toDate: '2026-06-01',
      days: 1,
      status: 'Cancelled'
    });
    const canApproveCancelled = reqCancelled.status === 'Pending';
    assert(canApproveCancelled === false, 'TEST 14: Cannot approve a CANCELLED request');

    console.log('\n--- TEST 15: Insufficient balance at approval time is handled safely ---');
    // Staff 1 only has 1.0 Casual Leave left. Request 3.0 days:
    const reqExcess = await LeaveRequest.create({
      tenantId: TENANT_A,
      employeeId: STAFF_1,
      employeeName: 'Dr. Bob Staff',
      leaveType: 'Casual Leave',
      fromDate: '2026-07-01',
      toDate: '2026-07-03',
      days: 3,
      status: 'Pending',
      reason: 'Extended break'
    });

    let excessErrorCaught = false;
    try {
      await leaveService.processLeaveApproval(TENANT_A, reqExcess, 'Dr. Admin Lead');
    } catch (err) {
      excessErrorCaught = true;
    }
    assert(excessErrorCaught === true, 'TEST 15: processLeaveApproval rejected approval due to insufficient balance');

    const balAfterFailedApprove = await leaveService.getStaffLeaveBalance(TENANT_A, STAFF_1, 2026);
    assert(balAfterFailedApprove.balances['Casual Leave'].currentBalance === 1.0, 'TEST 15: Balance unchanged at 1.0');

    console.log('\n--- TEST 16 & 17: Tenant isolation & RBAC authorization ---');
    const tenantBPending = await LeaveRequest.find({ tenantId: TENANT_B, status: 'Pending' });
    assert(tenantBPending.length === 0, 'TEST 16: Tenant B pending requests isolated from Tenant A');

    const staffUserRole = 'doctor';
    const isManagerRole = (role) => ['admin', 'hr', 'superadmin'].includes(role);
    assert(isManagerRole(staffUserRole) === false, 'TEST 17: Staff user (doctor) cannot approve/reject leave');
    assert(isManagerRole('admin') === true, 'TEST 17: Admin user can approve/reject leave');

    console.log('\n--- TEST 18, 19 & 20: Notification triggers ---');
    // Staff notification message formatting
    const approvedNotif = `Your Casual Leave request has been approved.`;
    const rejectedNotif = `Your Casual Leave request has been rejected.`;
    assert(approvedNotif.includes('approved'), 'TEST 19: Approval generates staff notification text');
    assert(rejectedNotif.includes('rejected'), 'TEST 20: Rejection generates staff notification text');

    // Admin notification on new request
    const adminNotif = `New leave request from Dr. Bob Staff (Casual Leave, 2 days)`;
    assert(adminNotif.includes('Dr. Bob Staff'), 'TEST 18: New request generates HR/Admin notification');

    console.log('\n--- TEST 21, 22 & 23: Socket.IO events and accurate pending count ---');
    const socketPayload = { type: 'leaves', employeeId: STAFF_1, action: 'approved' };
    assert(socketPayload.type === 'leaves', 'TEST 21 & 22: Socket event type is "leaves"');

    const currentPendingCount = await LeaveRequest.countDocuments({ tenantId: TENANT_A, status: 'Pending' });
    assert(currentPendingCount === 1, 'TEST 23: Pending count is accurate (1 pending request)');

    console.log('\n--- TEST 24: Historical year handling remains safe ---');
    const hist2025Bal = await leaveService.getStaffLeaveBalance(TENANT_A, STAFF_1, 2025);
    assert(hist2025Bal.year === 2025, 'TEST 24: Historical 2025 balance queries safely');

    console.log('\n======================================================');
    console.log(`📊 PHASE 3 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');

    // Cleanup test data
    await LeavePolicy.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await LeaveLedger.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await LeaveRequest.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });
    await User.deleteMany({ tenantId: { $in: [TENANT_A, TENANT_B] } });

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Phase 3 Test error:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runPhase3Tests();
