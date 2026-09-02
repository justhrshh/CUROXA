const LeavePolicy = require('../models/LeavePolicy');
const LeaveLedger = require('../models/LeaveLedger');
const LeaveRequest = require('../models/LeaveRequest');
const User = require('../models/User');

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Normalizes input leave type names / aliases to standard display names and codes
 */
const normalizeLeaveType = (inputName = '') => {
  const clean = String(inputName || '').trim().toLowerCase();
  
  if (clean === 'sick' || clean === 'sick leave' || clean === 'sl') {
    return { leaveType: 'Sick Leave', code: 'SICK' };
  }
  if (clean === 'casual' || clean === 'casual leave' || clean === 'cl') {
    return { leaveType: 'Casual Leave', code: 'CASUAL' };
  }
  if (clean === 'earned' || clean === 'earned leave' || clean === 'annual' || clean === 'annual leave' || clean === 'el' || clean === 'al') {
    return { leaveType: 'Earned Leave', code: 'EARNED' };
  }
  if (clean === 'maternity' || clean === 'maternity leave' || clean === 'ml') {
    return { leaveType: 'Maternity Leave', code: 'MATERNITY' };
  }
  if (clean === 'paternity' || clean === 'paternity leave' || clean === 'pl') {
    return { leaveType: 'Paternity Leave', code: 'PATERNITY' };
  }
  if (clean === 'comp off' || clean === 'compoff' || clean === 'compensatory off' || clean === 'co') {
    return { leaveType: 'Comp Off', code: 'COMP_OFF' };
  }
  if (clean === 'loss of pay' || clean === 'lwp' || clean === 'unpaid' || clean === 'lop') {
    return { leaveType: 'Loss of Pay', code: 'LWP' };
  }

  // Fallback for custom configured categories
  const formattedType = String(inputName || '').trim();
  const code = formattedType.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  return { leaveType: formattedType, code };
};

/**
 * Validates employee gender eligibility for leave types (e.g. Maternity for Female only, Paternity for Male only).
 */
const isEmployeeEligibleForLeaveType = (leaveTypeObjOrName = '', employeeGender = '') => {
  const name = typeof leaveTypeObjOrName === 'string' ? leaveTypeObjOrName : leaveTypeObjOrName?.leaveType || '';
  const clean = String(name || '').toLowerCase().trim();
  const g = String(employeeGender || '').toLowerCase().trim();

  if (clean.includes('maternity')) {
    // Only eligible for female employees
    return g === 'female' || g === 'f';
  }
  if (clean.includes('paternity')) {
    // Only eligible for male employees
    return g === 'male' || g === 'm';
  }
  return true;
};

/**
 * Determines authoritative operational start year for a tenant.
 */
const getTenantStartYear = async (tenantId) => {
  if (!tenantId) return new Date().getFullYear();

  let minYear = Infinity;

  try {
    const SuperAdminHospital = require('../models/SuperAdminHospital');
    const hospital = await SuperAdminHospital.findOne({ code: tenantId }).lean();
    if (hospital?.goLiveDate) {
      const yr = new Date(hospital.goLiveDate).getFullYear();
      if (!isNaN(yr) && yr >= 2000) minYear = Math.min(minYear, yr);
    }
    if (hospital?.createdAt) {
      const yr = new Date(hospital.createdAt).getFullYear();
      if (!isNaN(yr) && yr >= 2000) minYear = Math.min(minYear, yr);
    }
  } catch (e) {}

  try {
    const earliestLedger = await LeaveLedger.findOne({ tenantId }).sort({ year: 1 }).lean();
    if (earliestLedger?.year && earliestLedger.year >= 2000) {
      minYear = Math.min(minYear, earliestLedger.year);
    }
  } catch (e) {}

  try {
    const earliestUser = await User.findOne({ tenantId }).sort({ createdAt: 1 }).lean();
    if (earliestUser?.createdAt) {
      const yr = new Date(earliestUser.createdAt).getFullYear();
      if (!isNaN(yr) && yr >= 2000) minYear = Math.min(minYear, yr);
    }
  } catch (e) {}

  if (minYear !== Infinity) {
    return minYear;
  }

  return new Date().getFullYear();
};

/**
 * Retrieves the leave policy for a tenant, creating default if none exists.
 */
const getLeavePolicy = async (tenantId) => {
  if (!tenantId) throw new Error('tenantId is required');
  let policy = await LeavePolicy.findOne({ tenantId });
  if (!policy) {
    policy = await LeavePolicy.create({ tenantId });
  }
  return policy;
};

/**
 * Updates tenant leave policy (does not alter historical ledger records).
 */
const updateLeavePolicy = async (tenantId, policyData, actor = 'HR Administrator') => {
  if (!tenantId) throw new Error('tenantId is required');
  
  const existing = await getLeavePolicy(tenantId);
  const updatedLeaveTypes = policyData.leaveTypes || existing.leaveTypes;
  const fiscalOrCalendar = policyData.fiscalOrCalendar || existing.fiscalOrCalendar || 'calendar';

  const policy = await LeavePolicy.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        leaveTypes: updatedLeaveTypes,
        fiscalOrCalendar,
        updatedBy: actor
      }
    },
    { returnDocument: 'after', upsert: true }
  );

  return policy;
};

/**
 * Authoritative single balance calculation for a staff member in a specific year.
 * Derives current balance from opening, carry-forward, monthly accruals, adjustments, and approved consumption.
 */
const getStaffLeaveBalance = async (tenantId, employeeId, year = new Date().getFullYear()) => {
  if (!tenantId || !employeeId) {
    throw new Error('tenantId and employeeId are required');
  }
  const targetYear = Number(year) || new Date().getFullYear();
  const tenantStartYear = await getTenantStartYear(tenantId);

  // If queried year is before tenant operational start year, return clean non-operational response
  if (targetYear < tenantStartYear) {
    return {
      tenantId,
      employeeId,
      year: targetYear,
      tenantStartYear,
      isValidYear: false,
      balances: {}
    };
  }

  // Lookup employee gender for eligibility checks
  let empGender = '';
  try {
    const isObjId = typeof employeeId === 'string' && employeeId.length === 24 && /^[0-9a-fA-F]+$/.test(employeeId);
    const empUser = await User.findOne({
      tenantId,
      $or: [
        { staff_id: employeeId },
        ...(isObjId ? [{ _id: employeeId }] : [])
      ]
    }).lean();
    empGender = empUser?.gender || '';
  } catch (e) {}

  const policy = await getLeavePolicy(tenantId);
  const ledgerEntries = await LeaveLedger.find({
    tenantId,
    employeeId,
    year: targetYear
  }).sort({ createdAt: 1 }).lean();

  const balances = {};

  // Populate initial bucket for all enabled and eligible policy types
  policy.leaveTypes.forEach(lt => {
    if (!lt.enabled) return;
    if (empGender && !isEmployeeEligibleForLeaveType(lt, empGender)) return;

    balances[lt.leaveType] = {
      leaveType: lt.leaveType,
      code: lt.code,
      paid: lt.paid,
      monthlyAccrual: lt.monthlyAccrual,
      annualEntitlement: lt.annualEntitlement,
      carryForwardAllowed: lt.carryForward,
      maxCarryForward: lt.maxCarryForward,
      opening: 0,
      carryForward: 0,
      accrued: 0,
      adjustments: 0,
      consumed: 0,
      currentBalance: 0
    };
  });

  // Calculate totals from ledger transactions
  ledgerEntries.forEach(entry => {
    const norm = normalizeLeaveType(entry.leaveType || entry.leaveTypeCode);
    if (empGender && !isEmployeeEligibleForLeaveType(norm.leaveType, empGender)) return;

    const key = Object.keys(balances).find(
      k => k.toLowerCase() === norm.leaveType.toLowerCase() || balances[k].code === norm.code
    ) || norm.leaveType;

    if (!balances[key]) {
      balances[key] = {
        leaveType: norm.leaveType,
        code: norm.code,
        paid: true,
        monthlyAccrual: 0,
        annualEntitlement: 0,
        carryForwardAllowed: false,
        maxCarryForward: 0,
        opening: 0,
        carryForward: 0,
        accrued: 0,
        adjustments: 0,
        consumed: 0,
        currentBalance: 0
      };
    }

    const amt = Number(entry.amount) || 0;

    switch (entry.transactionType) {
      case 'OPENING':
        balances[key].opening += amt;
        break;
      case 'CARRY_FORWARD':
        balances[key].carryForward += amt;
        break;
      case 'MONTHLY_ACCRUAL':
        balances[key].accrued += amt;
        break;
      case 'ADJUSTMENT':
        balances[key].adjustments += amt;
        break;
      case 'APPROVED_CONSUMPTION':
        // Consumption is negative in ledger
        balances[key].consumed += Math.abs(amt);
        break;
      case 'CONSUMPTION_REVERSAL':
        // Reversal refunds consumption
        balances[key].consumed = Math.max(0, balances[key].consumed - Math.abs(amt));
        break;
      default:
        break;
    }
  });

  // Calculate final current balances
  Object.keys(balances).forEach(k => {
    const b = balances[k];
    b.currentBalance = Number((b.opening + b.carryForward + b.accrued + b.adjustments - b.consumed).toFixed(2));
  });

  return {
    tenantId,
    employeeId,
    year: targetYear,
    tenantStartYear,
    isValidYear: true,
    balances,
    ledger: ledgerEntries
  };
};

/**
 * Safe yearly initialization mechanism for a staff member.
 * Idempotent: Only initializes if no opening/carry-forward transactions exist for this staff and year.
 */
const initializeYearForStaff = async (tenantId, employeeId, year = new Date().getFullYear(), actor = 'System') => {
  if (!tenantId || !employeeId) throw new Error('tenantId and employeeId are required');
  const targetYear = Number(year) || new Date().getFullYear();

  // Check if year already initialized for this staff member
  const existingInit = await LeaveLedger.findOne({
    tenantId,
    employeeId,
    year: targetYear,
    transactionType: { $in: ['OPENING', 'CARRY_FORWARD'] }
  });

  if (existingInit) {
    // Already initialized, return existing balances
    return getStaffLeaveBalance(tenantId, employeeId, targetYear);
  }

  const policy = await getLeavePolicy(tenantId);
  const prevYear = targetYear - 1;
  let prevYearBalances = null;

  // Check if previous year records exist for carry-forward eligibility
  const prevLedgerCount = await LeaveLedger.countDocuments({
    tenantId,
    employeeId,
    year: prevYear
  });

  if (prevLedgerCount > 0) {
    prevYearBalances = await getStaffLeaveBalance(tenantId, employeeId, prevYear);
  }

  // Lookup employee gender for eligibility
  let empGender = '';
  try {
    const isObjId = typeof employeeId === 'string' && employeeId.length === 24 && /^[0-9a-fA-F]+$/.test(employeeId);
    const empUser = await User.findOne({
      tenantId,
      $or: [
        { staff_id: employeeId },
        ...(isObjId ? [{ _id: employeeId }] : [])
      ]
    }).lean();
    empGender = empUser?.gender || '';
  } catch (e) {}

  const newTransactions = [];

  for (const lt of policy.leaveTypes) {
    if (!lt.enabled) continue;
    if (empGender && !isEmployeeEligibleForLeaveType(lt, empGender)) continue;

    let carryForwardAmount = 0;

    // Check carry-forward rule
    if (lt.carryForward && prevYearBalances?.balances) {
      const prevBal = prevYearBalances.balances[lt.leaveType]?.currentBalance || 0;
      if (prevBal > 0) {
        carryForwardAmount = lt.maxCarryForward > 0 
          ? Math.min(prevBal, lt.maxCarryForward)
          : prevBal;
      }
    }

    if (carryForwardAmount > 0) {
      newTransactions.push({
        tenantId,
        employeeId,
        year: targetYear,
        leaveType: lt.leaveType,
        leaveTypeCode: lt.code,
        transactionType: 'CARRY_FORWARD',
        amount: Number(carryForwardAmount.toFixed(2)),
        reason: `Carry forward from ${prevYear} closing balance`,
        actor
      });
    }

    // Upfront annual entitlement for non-accruing leave types (e.g. Maternity / Paternity)
    if (lt.monthlyAccrual === 0 && lt.annualEntitlement > 0) {
      newTransactions.push({
        tenantId,
        employeeId,
        year: targetYear,
        leaveType: lt.leaveType,
        leaveTypeCode: lt.code,
        transactionType: 'OPENING',
        amount: Number(lt.annualEntitlement.toFixed(2)),
        reason: `Annual entitlement opening balance for ${targetYear}`,
        actor
      });
    } else if (carryForwardAmount === 0) {
      // Create baseline opening 0 transaction to mark year initialization
      newTransactions.push({
        tenantId,
        employeeId,
        year: targetYear,
        leaveType: lt.leaveType,
        leaveTypeCode: lt.code,
        transactionType: 'OPENING',
        amount: 0,
        reason: `Year ${targetYear} initial opening allocation`,
        actor
      });
    }
  }

  if (newTransactions.length > 0) {
    await LeaveLedger.insertMany(newTransactions);
  }

  return getStaffLeaveBalance(tenantId, employeeId, targetYear);
};

/**
 * Initializes year for all staff members belonging to a tenant.
 */
const initializeYearForTenant = async (tenantId, year = new Date().getFullYear(), actor = 'System') => {
  if (!tenantId) throw new Error('tenantId is required');
  const targetYear = Number(year) || new Date().getFullYear();

  const employees = await User.find({ tenantId }, 'staff_id name email').lean();
  let initializedCount = 0;

  for (const emp of employees) {
    const empId = emp.staff_id || emp._id.toString();
    await initializeYearForStaff(tenantId, empId, targetYear, actor);
    initializedCount++;
  }

  return {
    tenantId,
    year: targetYear,
    totalEmployees: employees.length,
    initializedCount
  };
};

/**
 * Authoritative monthly accrual mechanism.
 * Idempotent: checks for existing MONTHLY_ACCRUAL transaction for each (tenantId, employeeId, year, month, leaveType)
 * so running it multiple times creates only ONE credit transaction.
 */
const accrueMonthlyLeaves = async (tenantId, year = new Date().getFullYear(), month = new Date().getMonth() + 1, specificEmployeeId = null, actor = 'System Accrual') => {
  if (!tenantId) throw new Error('tenantId is required');
  const targetYear = Number(year) || new Date().getFullYear();
  const targetMonth = Number(month) || (new Date().getMonth() + 1);

  if (targetMonth < 1 || targetMonth > 12) {
    throw new Error('Month must be between 1 and 12');
  }

  const policy = await getLeavePolicy(tenantId);
  const monthName = MONTH_NAMES[targetMonth - 1];

  let employees = [];
  if (specificEmployeeId) {
    employees = [{ staff_id: specificEmployeeId }];
  } else {
    employees = await User.find({ tenantId }, 'staff_id name email').lean();
  }

  const createdCredits = [];
  const skippedDuplicates = [];

  for (const emp of employees) {
    const empId = emp.staff_id || emp._id?.toString();
    if (!empId) continue;

    // Ensure year is initialized first
    await initializeYearForStaff(tenantId, empId, targetYear, actor);

    for (const lt of policy.leaveTypes) {
      if (!lt.enabled || lt.monthlyAccrual <= 0) continue;

      // Check if already accrued for this specific month & year
      const alreadyAccrued = await LeaveLedger.findOne({
        tenantId,
        employeeId: empId,
        year: targetYear,
        leaveTypeCode: lt.code,
        transactionType: 'MONTHLY_ACCRUAL',
        month: targetMonth
      });

      if (alreadyAccrued) {
        skippedDuplicates.push({
          employeeId: empId,
          leaveType: lt.leaveType,
          month: targetMonth,
          year: targetYear
        });
        continue;
      }

      const creditTx = await LeaveLedger.create({
        tenantId,
        employeeId: empId,
        year: targetYear,
        leaveType: lt.leaveType,
        leaveTypeCode: lt.code,
        transactionType: 'MONTHLY_ACCRUAL',
        amount: Number(lt.monthlyAccrual.toFixed(2)),
        month: targetMonth,
        reason: `Monthly accrual for ${monthName} ${targetYear}`,
        actor
      });

      createdCredits.push(creditTx);
    }
  }

  return {
    tenantId,
    year: targetYear,
    month: targetMonth,
    monthName,
    creditedCount: createdCredits.length,
    skippedDuplicateCount: skippedDuplicates.length,
    createdCredits
  };
};

const AttendanceRecord = require('../models/AttendanceRecord');

/**
 * Splits a date range into calendar-year segments for cross-year leave accounting.
 */
const splitLeaveByYear = (fromDate, toDate, totalDays, isHalfDay = false) => {
  const d1 = new Date(fromDate);
  const d2 = new Date(toDate);
  const startYear = d1.getFullYear();
  const endYear = d2.getFullYear();

  if (startYear === endYear || isNaN(startYear) || isNaN(endYear)) {
    return [{
      year: startYear || new Date().getFullYear(),
      fromDate,
      toDate,
      days: Number(totalDays) || 1
    }];
  }

  const segments = [];
  let curr = new Date(d1);

  while (curr.getFullYear() <= endYear) {
    const yr = curr.getFullYear();
    const segStart = (yr === startYear) ? fromDate : `${yr}-01-01`;
    const segEnd = (yr === endYear) ? toDate : `${yr}-12-31`;

    const startD = new Date(segStart);
    const endD = new Date(segEnd);
    const diffTime = Math.abs(endD - startD);
    let segDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    if (isHalfDay) segDays = 0.5;

    segments.push({
      year: yr,
      fromDate: segStart,
      toDate: segEnd,
      days: segDays
    });

    // Advance to next year
    curr = new Date(`${yr + 1}-01-01`);
  }

  return segments;
};

/**
 * Synchronizes approved leave dates to Attendance records safely and idempotently.
 * Attendance records reflect status: 'Leave'. Attendance does NOT trigger extra debits.
 */
const syncApprovedLeaveToAttendance = async (tenantId, leaveRequest) => {
  if (!tenantId || !leaveRequest) return;
  const fromDate = leaveRequest.fromDate || leaveRequest.startDate;
  const toDate = leaveRequest.toDate || leaveRequest.endDate || fromDate;
  if (!fromDate || !toDate) return;

  const d1 = new Date(fromDate);
  const d2 = new Date(toDate);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return;

  const employeeId = leaveRequest.employeeId;
  const employeeName = leaveRequest.employeeName || 'Staff Member';

  const cur = new Date(d1);
  while (cur <= d2) {
    const dateStr = cur.toISOString().split('T')[0];
    await AttendanceRecord.findOneAndUpdate(
      { tenantId, employeeId, date: dateStr },
      {
        $set: {
          tenantId,
          employeeId,
          employeeName,
          date: dateStr,
          status: 'Leave',
          device: 'HR Leave System',
          location: 'On Leave',
          correctionReason: `Approved ${leaveRequest.leaveType || 'Leave'} (${fromDate} to ${toDate})`
        }
      },
      { upsert: true, returnDocument: 'after' }
    );
    cur.setDate(cur.getDate() + 1);
  }
};

/**
 * Reverts auto-created attendance records when an approved leave is rejected or cancelled.
 */
const revertLeaveFromAttendance = async (tenantId, leaveRequest) => {
  if (!tenantId || !leaveRequest) return;
  const fromDate = leaveRequest.fromDate || leaveRequest.startDate;
  const toDate = leaveRequest.toDate || leaveRequest.endDate || fromDate;
  if (!fromDate || !toDate) return;

  const d1 = new Date(fromDate);
  const d2 = new Date(toDate);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return;

  const employeeId = leaveRequest.employeeId;
  const cur = new Date(d1);
  while (cur <= d2) {
    const dateStr = cur.toISOString().split('T')[0];
    // Delete or reset auto-marked leave attendance
    await AttendanceRecord.findOneAndDelete({
      tenantId,
      employeeId,
      date: dateStr,
      device: 'HR Leave System'
    });
    cur.setDate(cur.getDate() + 1);
  }
};

/**
 * Debits leave balance upon leave approval.
 * Supports cross-year date splitting and creates year-specific debit transactions.
 * Idempotent: checks if APPROVED_CONSUMPTION transaction already exists for this leaveRequestId.
 */
const processLeaveApproval = async (tenantId, leaveRequest, actor = 'HR Administrator') => {
  if (!tenantId || !leaveRequest) throw new Error('tenantId and leaveRequest are required');

  const leaveId = leaveRequest._id || leaveRequest.id;
  const empId = leaveRequest.employeeId;
  const fromDate = leaveRequest.fromDate || leaveRequest.startDate || new Date().toISOString().split('T')[0];
  const toDate = leaveRequest.toDate || leaveRequest.endDate || fromDate;
  const isHalfDay = leaveRequest.halfDay || false;
  const totalDays = Number(leaveRequest.days) || 1;

  // Check if already debited
  const existingDebit = await LeaveLedger.findOne({
    tenantId,
    leaveRequestId: leaveId,
    transactionType: 'APPROVED_CONSUMPTION'
  });

  if (existingDebit) {
    return {
      success: true,
      alreadyDebited: true,
      transaction: existingDebit
    };
  }

  const segments = splitLeaveByYear(fromDate, toDate, totalDays, isHalfDay);
  const norm = normalizeLeaveType(leaveRequest.leaveType);
  const policy = await getLeavePolicy(tenantId);
  const policyType = policy.leaveTypes.find(
    lt => lt.code === norm.code || lt.leaveType.toLowerCase() === norm.leaveType.toLowerCase()
  );

  // Validate balance for each year segment
  if (policyType && policyType.paid && norm.code !== 'LWP') {
    for (const seg of segments) {
      await initializeYearForStaff(tenantId, empId, seg.year, actor);
      const currentBalanceData = await getStaffLeaveBalance(tenantId, empId, seg.year);
      const balEntry = currentBalanceData.balances[policyType.leaveType] || currentBalanceData.balances[norm.leaveType];
      const available = balEntry ? balEntry.currentBalance : 0;
      if (seg.days > available) {
        throw new Error(`Leave cannot be approved because employee has insufficient ${norm.leaveType} balance in ${seg.year}. Available: ${available} day(s), Requested: ${seg.days} day(s).`);
      }
    }
  }

  const createdDebits = [];
  for (const seg of segments) {
    await initializeYearForStaff(tenantId, empId, seg.year, actor);

    const debitTx = await LeaveLedger.create({
      tenantId,
      employeeId: empId,
      year: seg.year,
      leaveType: norm.leaveType,
      leaveTypeCode: norm.code,
      transactionType: 'APPROVED_CONSUMPTION',
      amount: -Math.abs(seg.days),
      reason: `Approved leave request (${seg.fromDate} to ${seg.toDate})`,
      leaveRequestId: leaveId,
      actor
    });
    createdDebits.push(debitTx);
  }

  // Synchronize with Attendance records
  await syncApprovedLeaveToAttendance(tenantId, leaveRequest);

  const updatedBalances = await getStaffLeaveBalance(tenantId, empId, segments[0].year);

  return {
    success: true,
    alreadyDebited: false,
    transactions: createdDebits,
    transaction: createdDebits[0],
    balances: updatedBalances
  };
};

/**
 * Reverses a previously approved leave if it gets rejected or cancelled later.
 */
const processLeaveRejectionOrCancellation = async (tenantId, leaveRequest, actor = 'HR Administrator') => {
  if (!tenantId || !leaveRequest) throw new Error('tenantId and leaveRequest are required');

  const leaveId = leaveRequest._id || leaveRequest.id;
  const empId = leaveRequest.employeeId;

  // Find all debits created for this request
  const existingDebits = await LeaveLedger.find({
    tenantId,
    leaveRequestId: leaveId,
    transactionType: 'APPROVED_CONSUMPTION'
  });

  if (!existingDebits || existingDebits.length === 0) {
    return { success: true, reversed: false };
  }

  // Check if already reversed
  const existingReversals = await LeaveLedger.find({
    tenantId,
    leaveRequestId: leaveId,
    transactionType: 'CONSUMPTION_REVERSAL'
  });

  if (existingReversals.length >= existingDebits.length) {
    return { success: true, alreadyReversed: true, transactions: existingReversals };
  }

  const norm = normalizeLeaveType(leaveRequest.leaveType);
  const createdReversals = [];

  for (const debit of existingDebits) {
    const reversalTx = await LeaveLedger.create({
      tenantId,
      employeeId: empId,
      year: debit.year,
      leaveType: norm.leaveType,
      leaveTypeCode: norm.code,
      transactionType: 'CONSUMPTION_REVERSAL',
      amount: Math.abs(debit.amount),
      reason: `Reversal of cancelled/rejected leave request for ${debit.year}`,
      leaveRequestId: leaveId,
      actor
    });
    createdReversals.push(reversalTx);
  }

  // Revert attendance records
  await revertLeaveFromAttendance(tenantId, leaveRequest);

  const primaryYear = existingDebits[0]?.year || new Date().getFullYear();
  const updatedBalances = await getStaffLeaveBalance(tenantId, empId, primaryYear);

  return {
    success: true,
    reversed: true,
    transactions: createdReversals,
    transaction: createdReversals[0],
    balances: updatedBalances
  };
};

/**
 * Initializes year transition across all active tenants independently with error isolation.
 */
const initializeAllTenantsForYear = async (year = new Date().getFullYear(), actor = 'System Yearly Scheduler') => {
  const targetYear = Number(year) || new Date().getFullYear();
  const distinctTenants = await User.distinct('tenantId', { tenantId: { $ne: null } });

  const results = await Promise.all(
    distinctTenants.map(async (tId) => {
      if (!tId) return null;
      try {
        const res = await initializeYearForTenant(tId, targetYear, actor);
        return { tenantId: tId, success: true, ...res };
      } catch (err) {
        console.error(`[LeaveService] Year initialization failed for tenant "${tId}":`, err.message);
        return { tenantId: tId, success: false, error: err.message };
      }
    })
  );

  const filtered = results.filter(Boolean);
  return {
    year: targetYear,
    totalTenants: distinctTenants.length,
    processedCount: filtered.length,
    results: filtered
  };
};

module.exports = {
  normalizeLeaveType,
  isEmployeeEligibleForLeaveType,
  getTenantStartYear,
  getLeavePolicy,
  updateLeavePolicy,
  getStaffLeaveBalance,
  initializeYearForStaff,
  initializeYearForTenant,
  initializeAllTenantsForYear,
  accrueMonthlyLeaves,
  splitLeaveByYear,
  syncApprovedLeaveToAttendance,
  revertLeaveFromAttendance,
  processLeaveApproval,
  processLeaveRejectionOrCancellation
};
