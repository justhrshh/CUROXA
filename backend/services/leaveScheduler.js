/**
 * CUROXA LEAVE MANAGEMENT — BACKGROUND SCHEDULER & AUTOMATION
 * Handles automated yearly transition & monthly accruals across all tenants
 */

const User = require('../models/User');
const {
  initializeYearForTenant,
  accrueMonthlyLeaves,
  initializeAllTenantsForYear
} = require('./leaveService');

/**
 * Runs scheduled yearly leave transition for all active tenants.
 * Idempotent: Can be run multiple times safely.
 */
const runScheduledYearTransition = async (targetYear = new Date().getFullYear()) => {
  console.log(`[LeaveScheduler] Starting yearly transition for year ${targetYear}...`);
  const result = await initializeAllTenantsForYear(targetYear, 'Automated Yearly Scheduler');
  console.log(`[LeaveScheduler] Yearly transition finished. Processed ${result.processedCount}/${result.totalTenants} tenants.`);
  return result;
};

/**
 * Runs scheduled monthly accrual across all active tenants.
 * Idempotent: Does not duplicate credits if already processed for (year, month).
 */
const runScheduledMonthlyAccrual = async (year = new Date().getFullYear(), month = new Date().getMonth() + 1) => {
  console.log(`[LeaveScheduler] Starting monthly accruals for ${month}/${year}...`);
  const distinctTenants = await User.distinct('tenantId', { tenantId: { $ne: null } });

  const results = await Promise.all(
    distinctTenants.map(async (tId) => {
      if (!tId) return null;
      try {
        const res = await accrueMonthlyLeaves(tId, year, month, null, 'Automated Monthly Accrual');
        return { tenantId: tId, success: true, ...res };
      } catch (err) {
        console.error(`[LeaveScheduler] Monthly accrual failed for tenant "${tId}":`, err.message);
        return { tenantId: tId, success: false, error: err.message };
      }
    })
  );

  const filtered = results.filter(Boolean);
  console.log(`[LeaveScheduler] Monthly accrual finished. Processed ${filtered.length} tenants.`);
  return {
    year,
    month,
    totalTenants: distinctTenants.length,
    processedCount: filtered.length,
    results: filtered
  };
};

/**
 * Starts background scheduler interval (runs once every 24 hours to check for month/year rollovers).
 */
let schedulerInterval = null;
const startLeaveBackgroundScheduler = () => {
  if (schedulerInterval) return;

  // Run initial check on startup
  const now = new Date();
  runScheduledYearTransition(now.getFullYear()).catch(err => console.warn('[LeaveScheduler] Startup year check error:', err.message));
  runScheduledMonthlyAccrual(now.getFullYear(), now.getMonth() + 1).catch(err => console.warn('[LeaveScheduler] Startup month check error:', err.message));

  // Run daily check every 24 hours
  schedulerInterval = setInterval(() => {
    const cur = new Date();
    runScheduledYearTransition(cur.getFullYear()).catch(err => console.warn('[LeaveScheduler] Daily year check error:', err.message));
    runScheduledMonthlyAccrual(cur.getFullYear(), cur.getMonth() + 1).catch(err => console.warn('[LeaveScheduler] Daily month check error:', err.message));
  }, 24 * 60 * 60 * 1000);

  if (schedulerInterval.unref) schedulerInterval.unref();
};

module.exports = {
  runScheduledYearTransition,
  runScheduledMonthlyAccrual,
  startLeaveBackgroundScheduler
};
