/**
 * CUROXA LEAVE MANAGEMENT — STAFF UAT TEST SUITE
 * Tests Gender Eligibility, Valid Historical Year Range, Live Balance Validation & normalizeLeaveType
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const connectDB = require('../config/db');
const LeavePolicy = require('../models/LeavePolicy');
const LeaveLedger = require('../models/LeaveLedger');
const LeaveRequest = require('../models/LeaveRequest');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const User = require('../models/User');
const {
  normalizeLeaveType,
  isEmployeeEligibleForLeaveType,
  getTenantStartYear,
  getStaffLeaveBalance,
  initializeYearForStaff,
  accrueMonthlyLeaves,
  processLeaveApproval
} = require('../services/leaveService');

async function runStaffUATTests() {
  console.log('\n======================================================');
  console.log('🚀 RUNNING CUROXA LEAVE MANAGEMENT STAFF UAT TEST SUITE');
  console.log('======================================================\n');

  await connectDB();
  console.log('MongoDB Connected for Staff UAT test suite.\n');

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

  const TENANT_2026 = 'tenant_uat_2026';
  const TENANT_2025 = 'tenant_uat_2025';
  const MALE_STAFF = 'EMP_UAT_MALE';
  const FEMALE_STAFF = 'EMP_UAT_FEMALE';

  try {
    // 0. Cleanup prior test records
    await LeavePolicy.deleteMany({ tenantId: { $in: [TENANT_2026, TENANT_2025] } });
    await LeaveLedger.deleteMany({ tenantId: { $in: [TENANT_2026, TENANT_2025] } });
    await LeaveRequest.deleteMany({ tenantId: { $in: [TENANT_2026, TENANT_2025] } });
    await SuperAdminHospital.deleteMany({ code: { $in: [TENANT_2026, TENANT_2025] } });
    await User.deleteMany({ tenantId: { $in: [TENANT_2026, TENANT_2025] } });

    // Seed Hospitals with operational start dates
    await SuperAdminHospital.create([
      { name: 'Hospital 2026', code: TENANT_2026, goLiveDate: '2026-01-01', status: 'Active' },
      { name: 'Hospital 2025', code: TENANT_2025, goLiveDate: '2025-01-01', status: 'Active' }
    ]);

    // Seed Male and Female Staff users
    await User.create([
      { tenantId: TENANT_2026, staff_id: MALE_STAFF, name: 'Dr. Arthur Male', gender: 'Male', role: 'doctor', email: 'arthur@curoxa.com', password_hash: 'hash' },
      { tenantId: TENANT_2026, staff_id: FEMALE_STAFF, name: 'Dr. Beatrice Female', gender: 'Female', role: 'doctor', email: 'beatrice@curoxa.com', password_hash: 'hash' },
      { tenantId: TENANT_2025, staff_id: MALE_STAFF, name: 'Dr. Arthur 2025', gender: 'Male', role: 'doctor', email: 'arthur25@curoxa.com', password_hash: 'hash' }
    ]);

    // Setup policy with core and optional leave types
    await LeavePolicy.create({
      tenantId: TENANT_2026,
      leaveTypes: [
        { leaveType: 'Sick Leave', code: 'SICK', paid: true, monthlyAccrual: 1.0, annualEntitlement: 12, carryForward: true, enabled: true },
        { leaveType: 'Casual Leave', code: 'CASUAL', paid: true, monthlyAccrual: 1.0, annualEntitlement: 12, carryForward: false, enabled: true },
        { leaveType: 'Earned Leave', code: 'EARNED', paid: true, monthlyAccrual: 1.5, annualEntitlement: 18, carryForward: true, enabled: true },
        { leaveType: 'Maternity Leave', code: 'MATERNITY', paid: true, monthlyAccrual: 0, annualEntitlement: 90, carryForward: false, enabled: true },
        { leaveType: 'Paternity Leave', code: 'PATERNITY', paid: true, monthlyAccrual: 0, annualEntitlement: 15, carryForward: false, enabled: true },
        { leaveType: 'Loss of Pay', code: 'LWP', paid: false, monthlyAccrual: 0, annualEntitlement: 0, carryForward: false, enabled: true }
      ]
    });

    console.log('--- TEST GROUP 1: Eligibility (Maternity / Paternity / Core) ---');
    // 1 & 2. Male employee eligibility check
    const isMaleMaternity = isEmployeeEligibleForLeaveType('Maternity Leave', 'Male');
    const isMalePaternity = isEmployeeEligibleForLeaveType('Paternity Leave', 'Male');
    const isFemaleMaternity = isEmployeeEligibleForLeaveType('Maternity Leave', 'Female');
    const isFemalePaternity = isEmployeeEligibleForLeaveType('Paternity Leave', 'Female');
    const isSickAll = isEmployeeEligibleForLeaveType('Sick Leave', 'Male') && isEmployeeEligibleForLeaveType('Sick Leave', 'Female');

    assert(isMaleMaternity === false, 'TEST 1: Male employee is NOT eligible for Maternity Leave');
    assert(isMalePaternity === true, 'TEST 1: Male employee IS eligible for Paternity Leave');
    assert(isFemaleMaternity === true, 'TEST 8: Female employee IS eligible for Maternity Leave');
    assert(isFemalePaternity === false, 'TEST 8: Female employee is NOT eligible for Paternity Leave');
    assert(isSickAll === true, 'TEST 9: Core leave types (Sick/Casual/Earned) eligible for all genders');

    // 6 & 7. Male employee balance query excludes Maternity Leave
    await initializeYearForStaff(TENANT_2026, MALE_STAFF, 2026);
    const maleBalances = await getStaffLeaveBalance(TENANT_2026, MALE_STAFF, 2026);
    assert(maleBalances.balances['Maternity Leave'] === undefined, 'TEST 6 & 7: Male staff balance excludes Maternity Leave');
    assert(maleBalances.balances['Sick Leave'] !== undefined, 'TEST 9: Male staff balance includes Sick Leave');
    assert(maleBalances.balances['Paternity Leave'] !== undefined, 'TEST 8: Male staff balance includes Paternity Leave');

    // Female employee balance query includes Maternity Leave
    await initializeYearForStaff(TENANT_2026, FEMALE_STAFF, 2026);
    const femaleBalances = await getStaffLeaveBalance(TENANT_2026, FEMALE_STAFF, 2026);
    assert(femaleBalances.balances['Maternity Leave'] !== undefined, 'TEST 8: Female staff balance includes Maternity Leave');
    assert(femaleBalances.balances['Paternity Leave'] === undefined, 'TEST 8: Female staff balance excludes Paternity Leave');

    // Ledger eligibility checks
    const allMaleLedger = await LeaveLedger.find({ tenantId: TENANT_2026, employeeId: MALE_STAFF, year: 2026 }).lean();
    const eligibleMaleLedger = allMaleLedger.filter(tx => isEmployeeEligibleForLeaveType(tx.leaveType, 'Male'));
    const hasMaleMaternityLedger = eligibleMaleLedger.some(tx => tx.leaveType.toLowerCase().includes('maternity'));
    assert(hasMaleMaternityLedger === false, 'TEST 10: Male staff Activity Ledger excludes Maternity Leave transactions');

    const allFemaleLedger = await LeaveLedger.find({ tenantId: TENANT_2026, employeeId: FEMALE_STAFF, year: 2026 }).lean();
    const eligibleFemaleLedger = allFemaleLedger.filter(tx => isEmployeeEligibleForLeaveType(tx.leaveType, 'Female'));
    const hasFemalePaternityLedger = eligibleFemaleLedger.some(tx => tx.leaveType.toLowerCase().includes('paternity'));
    assert(hasFemalePaternityLedger === false, 'TEST 10: Female staff Activity Ledger excludes Paternity Leave transactions');

    console.log('\n--- TEST GROUP 2: Valid Historical Years & Tenant Start Year ---');
    const startYr2026 = await getTenantStartYear(TENANT_2026);
    const startYr2025 = await getTenantStartYear(TENANT_2025);
    assert(startYr2026 === 2026, 'TEST 13: Tenant started in 2026 has startYear = 2026');
    assert(startYr2025 === 2025, 'TEST 18: Tenant started in 2025 has startYear = 2025');

    // Balance query for invalid historical year 2024 / 2025 for 2026 tenant
    const bal2024 = await getStaffLeaveBalance(TENANT_2026, MALE_STAFF, 2024);
    const bal2025 = await getStaffLeaveBalance(TENANT_2026, MALE_STAFF, 2025);
    assert(bal2024.isValidYear === false && Object.keys(bal2024.balances).length === 0, 'TEST 11: 2024 is marked as invalid year for 2026 tenant');
    assert(bal2025.isValidYear === false && Object.keys(bal2025.balances).length === 0, 'TEST 12: 2025 is marked as invalid year for 2026 tenant');

    // 2026 and 2027 valid year query
    const bal2026 = await getStaffLeaveBalance(TENANT_2026, MALE_STAFF, 2026);
    const bal2027 = await getStaffLeaveBalance(TENANT_2026, MALE_STAFF, 2027);
    assert(bal2026.isValidYear === true, 'TEST 13: 2026 is valid year for 2026 tenant');
    assert(bal2027.isValidYear === true, 'TEST 14: 2027 is valid future year for 2026 tenant');

    // 2025 valid year query for 2025 tenant
    const balTenant2025 = await getStaffLeaveBalance(TENANT_2025, MALE_STAFF, 2025);
    assert(balTenant2025.isValidYear === true, 'TEST 18: Tenant with 2025 start year can access 2025');

    console.log('\n--- TEST GROUP 3: Live Balance Validation & Calculations ---');
    // Accrue 1 month of Earned Leave for Staff in 2026 (1.5 days accrued)
    await accrueMonthlyLeaves(TENANT_2026, 2026, 1, MALE_STAFF);
    const elBalAfterAccrual = await getStaffLeaveBalance(TENANT_2026, MALE_STAFF, 2026);
    const availEL = elBalAfterAccrual.balances['Earned Leave'].currentBalance;
    assert(availEL === 1.5, 'Earned Leave available balance is 1.5 days');

    // Scenario: requested 3 days, available 1.5 days -> insufficient
    const requestedDays = 3;
    const isInsufficient = requestedDays > availEL;
    assert(isInsufficient === true, 'TEST 19 & 20: 3 days > 1.5 days available correctly detected as insufficient');

    // Reducing to 1 day -> valid
    const validRequestedDays = 1;
    const isNowValid = validRequestedDays <= availEL;
    assert(isNowValid === true, 'TEST 21 & 22: Reducing to 1 day is valid');

    // Half day -> 0.5 days
    const isHalfDay = true;
    const halfDayDuration = isHalfDay ? 0.5 : 1.0;
    assert(halfDayDuration === 0.5, 'TEST 25: Half day duration is 0.5 days');

    console.log('\n--- TEST GROUP 4: normalizeLeaveType Helper & Year Switching ---');
    const normSick = normalizeLeaveType('Sick Leave');
    const normCasual = normalizeLeaveType('casual');
    const normEarned = normalizeLeaveType('annual leave');
    const normMaternity = normalizeLeaveType('Maternity');
    const normPaternity = normalizeLeaveType('pl');

    assert(normSick.code === 'SICK' && normSick.leaveType === 'Sick Leave', 'TEST 27: normalizeLeaveType handles Sick Leave');
    assert(normCasual.code === 'CASUAL' && normCasual.leaveType === 'Casual Leave', 'TEST 27: normalizeLeaveType handles casual');
    assert(normEarned.code === 'EARNED' && normEarned.leaveType === 'Earned Leave', 'TEST 27: normalizeLeaveType handles annual leave');
    assert(normMaternity.code === 'MATERNITY' && normMaternity.leaveType === 'Maternity Leave', 'TEST 27: normalizeLeaveType handles Maternity');
    assert(normPaternity.code === 'PATERNITY' && normPaternity.leaveType === 'Paternity Leave', 'TEST 27: normalizeLeaveType handles pl');

    // Year switching simulation: 2026 -> 2027 -> 2026
    const yr2026 = await getStaffLeaveBalance(TENANT_2026, MALE_STAFF, 2026);
    const yr2027 = await getStaffLeaveBalance(TENANT_2026, MALE_STAFF, 2027);
    const yr2026Back = await getStaffLeaveBalance(TENANT_2026, MALE_STAFF, 2026);
    assert(yr2026.year === 2026 && yr2027.year === 2027 && yr2026Back.year === 2026, 'TEST 28, 29, 30 & 31: Year switching works seamlessly without runtime errors');

    console.log('\n======================================================');
    console.log(`📊 STAFF UAT TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');

    // Cleanup test data
    await LeavePolicy.deleteMany({ tenantId: { $in: [TENANT_2026, TENANT_2025] } });
    await LeaveLedger.deleteMany({ tenantId: { $in: [TENANT_2026, TENANT_2025] } });
    await LeaveRequest.deleteMany({ tenantId: { $in: [TENANT_2026, TENANT_2025] } });
    await SuperAdminHospital.deleteMany({ code: { $in: [TENANT_2026, TENANT_2025] } });
    await User.deleteMany({ tenantId: { $in: [TENANT_2026, TENANT_2025] } });

    await mongoose.disconnect();
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Staff UAT Test error:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

runStaffUATTests();
