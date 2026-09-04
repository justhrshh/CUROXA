const SuperAdminHospital = require('../models/SuperAdminHospital');
const SuperAdminNotification = require('../models/SuperAdminNotification');

/**
 * Determines whether a hospital is on a TRIAL or PAID plan.
 * Recognizes existing Curoxa plan naming conventions:
 * - 'Trial Plan', 'Trial Plan (₹0/mo)'
 * - subscriptionPlan: 'trial' or 'custom'
 *
 * @param {Object} hospital - SuperAdminHospital document or plain object
 * @returns {boolean}
 */
function isTrialPlan(hospital) {
  if (!hospital) return false;
  const planStr = String(hospital.plan || '').toLowerCase();
  const subPlan = String(hospital.subscriptionPlan || '').toLowerCase();

  if (subPlan === 'trial' || subPlan === 'custom') {
    return true;
  }
  if (planStr.includes('trial')) {
    return true;
  }
  return false;
}

/**
 * Checks if a hospital has already used or is currently on a Trial plan.
 * A trial can only ever be used ONCE per hospital.
 *
 * @param {Object} hospital - SuperAdminHospital document or plain object
 * @returns {boolean}
 */
function hasHospitalUsedTrial(hospital) {
  if (!hospital) return false;
  if (hospital.trialUsed === true) return true;
  if (isTrialPlan(hospital)) return true;
  return false;
}

/**
 * Derives authoritative start and expiry dates for a hospital's subscription.
 * Handles both explicit stored dates and robust fallbacks from onboarding/creation dates.
 *
 * @param {Object} hospital
 * @returns {{ startDate: Date, expiryDate: Date, isTrial: boolean, daysRemaining: number, isExpired: boolean }}
 */
function getHospitalSubscriptionDates(hospital) {
  const isTrial = isTrialPlan(hospital);

  // 1. Determine Start Date
  let startDate = null;
  if (hospital.subscriptionStartDate) {
    const d = new Date(hospital.subscriptionStartDate);
    if (!isNaN(d.getTime())) startDate = d;
  }
  if (!startDate && hospital.goLiveDate) {
    const d = new Date(hospital.goLiveDate);
    if (!isNaN(d.getTime())) startDate = d;
  }
  if (!startDate && hospital.createdAt) {
    const d = new Date(hospital.createdAt);
    if (!isNaN(d.getTime())) startDate = d;
  }
  if (!startDate) {
    startDate = new Date();
  }

  // 2. Determine Expiry Date
  let expiryDate = null;
  if (hospital.subscriptionExpiryDate) {
    const d = new Date(hospital.subscriptionExpiryDate);
    if (!isNaN(d.getTime())) expiryDate = d;
  }

  if (!expiryDate) {
    if (isTrial) {
      // 7-day trial policy
      const trialDays = Number(hospital.trialDays) || 7;
      expiryDate = new Date(startDate.getTime() + trialDays * 24 * 60 * 60 * 1000);
    } else {
      // Paid plan: derived from contract duration or renewal cycle (default 1 year)
      const durationYears = Number(hospital.contractDurationYears) || 1;
      expiryDate = new Date(startDate);
      expiryDate.setFullYear(expiryDate.getFullYear() + durationYears);
    }
  }

  const now = Date.now();
  const expiryTime = expiryDate.getTime();
  const diffMs = expiryTime - now;

  let daysRemaining = 0;
  let isExpired = false;

  if (now >= expiryTime || hospital.status === 'Suspended') {
    daysRemaining = 0;
    isExpired = true;
  } else {
    daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    isExpired = false;
  }

  return {
    startDate,
    expiryDate,
    isTrial,
    daysRemaining,
    isExpired
  };
}

/**
 * Returns comprehensive subscription status for a hospital tenant.
 *
 * @param {Object} hospital - SuperAdminHospital document
 * @returns {{
 *   isTrial: boolean,
 *   planType: 'TRIAL' | 'PAID',
 *   startDate: Date,
 *   expiryDate: Date,
 *   daysRemaining: number,
 *   isExpired: boolean,
 *   status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'SUSPENDED',
 *   subscriptionRestricted: boolean
 * }}
 */
function getHospitalSubscriptionStatus(hospital) {
  if (!hospital) {
    return {
      isTrial: false,
      planType: 'PAID',
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      daysRemaining: 365,
      isExpired: false,
      status: 'ACTIVE',
      subscriptionRestricted: false
    };
  }

  if (hospital.status === 'Suspended') {
    const dates = getHospitalSubscriptionDates(hospital);
    return {
      isTrial: dates.isTrial,
      planType: dates.isTrial ? 'TRIAL' : 'PAID',
      startDate: dates.startDate,
      expiryDate: dates.expiryDate,
      daysRemaining: 0,
      isExpired: true,
      status: 'SUSPENDED',
      subscriptionRestricted: true
    };
  }

  const { startDate, expiryDate, isTrial, daysRemaining, isExpired } = getHospitalSubscriptionDates(hospital);

  let status = 'ACTIVE';
  if (isExpired) {
    status = 'EXPIRED';
  } else if (isTrial && daysRemaining <= 2) {
    status = 'EXPIRING';
  } else if (!isTrial && daysRemaining <= 5) {
    status = 'EXPIRING';
  }

  const trialUsed = hasHospitalUsedTrial(hospital);

  return {
    isTrial,
    planType: isTrial ? 'TRIAL' : 'PAID',
    startDate,
    expiryDate,
    daysRemaining,
    isExpired,
    status,
    subscriptionRestricted: isExpired,
    trialUsed,
    canUseTrial: !trialUsed
  };
}

/**
 * Idempotently checks and dispatches tenant-specific expiry warnings.
 *
 * Rules:
 * - Trial: 2 days, 1 day remaining
 * - Paid: 5, 4, 3, 2, 1 days remaining
 * - Strictly hospital-specific (records tenantId/hospitalCode)
 * - Idempotent: checks for existing notification with same tenantId and remaining days
 *
 * @param {Object} hospital - SuperAdminHospital document
 * @returns {Promise<{ created: boolean, notification?: Object }>}
 */
async function checkAndDispatchExpiryNotifications(hospital) {
  if (!hospital || !hospital.code) {
    return { created: false };
  }

  const status = getHospitalSubscriptionStatus(hospital);

  // If expired or plenty of time remaining, no warning trigger
  if (status.isExpired || status.status !== 'EXPIRING') {
    return { created: false };
  }

  const days = status.daysRemaining;
  const hospitalCode = String(hospital.code).toLowerCase();
  const hospitalName = hospital.name || 'Hospital';

  let title = '';
  let message = '';

  if (status.isTrial) {
    if (days === 2) {
      title = 'Trial Plan Expiring in 2 Days';
      message = 'Your trial plan expires in 2 days. Please upgrade your plan to continue using CUROXA.';
    } else if (days === 1) {
      title = 'Trial Plan Expiring Tomorrow';
      message = 'Your trial plan expires tomorrow. Please upgrade your plan to continue using CUROXA.';
    } else {
      return { created: false };
    }
  } else {
    // Paid plan: warnings at 5, 4, 3, 2, 1 days remaining
    if (days >= 1 && days <= 5) {
      title = `Subscription Expiring in ${days} Day${days > 1 ? 's' : ''}`;
      message = `Your subscription expires in ${days} day${days > 1 ? 's' : ''}. Please renew your plan to avoid interruption of service.`;
    } else {
      return { created: false };
    }
  }

  try {
    // Idempotency check: Look for an existing warning notification for this hospital tenant and day count
    const existing = await SuperAdminNotification.findOne({
      'metadata.tenantId': hospitalCode,
      'metadata.type': 'subscription_expiry_warning',
      'metadata.daysRemaining': days
    });

    if (existing) {
      return { created: false, notification: existing };
    }

    const notif = await SuperAdminNotification.create({
      title,
      message,
      type: 'warning',
      category: 'billing',
      metadata: {
        tenantId: hospitalCode,
        hospitalName,
        type: 'subscription_expiry_warning',
        daysRemaining: days,
        isTrial: status.isTrial,
        expiryDate: status.expiryDate
      }
    });

    console.log(`[SUBSCRIPTION NOTIFICATION] Sent ${days}-day warning to hospital '${hospitalName}' (${hospitalCode})`);
    return { created: true, notification: notif };
  } catch (err) {
    console.error(`[SUBSCRIPTION NOTIFICATION ERROR] Error dispatching warning for ${hospitalCode}:`, err.message);
    return { created: false };
  }
}

const FOUR_CORE_MODULES = ['reception', 'doctor', 'pharmacy', 'laboratory'];

const DEFAULT_PLAN_MODULES = {
  basic: ['reception', 'doctor'],
  professional: ['reception', 'doctor', 'pharmacy', 'laboratory'],
  enterprise: ['reception', 'doctor', 'pharmacy', 'laboratory'],
  custom: ['reception', 'doctor', 'pharmacy', 'laboratory'],
  trial: ['reception', 'doctor', 'pharmacy', 'laboratory']
};

/**
 * Resolves the plan-level module entitlements for a given hospital.
 * Inspects SuperAdminPlan collection, with fallback to standard defaults.
 *
 * @param {Object} hospital - SuperAdminHospital document or plain object
 * @returns {Promise<string[]>} List of lowercase module keys included in the plan
 */
async function getPlanModuleEntitlements(hospital) {
  if (!hospital) return FOUR_CORE_MODULES;

  const planStr = String(hospital.plan || '').toLowerCase().trim();
  const subPlan = String(hospital.subscriptionPlan || '').toLowerCase().trim();

  let planDoc = null;
  try {
    const mongoose = require('mongoose');
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const SuperAdminPlan = require('../models/SuperAdminPlan');
      if (subPlan === 'trial' || subPlan === 'custom' || planStr.includes('trial')) {
        planDoc = await SuperAdminPlan.findOne({ matchKey: 'custom' });
      } else if (planStr.includes('enterprise')) {
        planDoc = await SuperAdminPlan.findOne({ matchKey: 'enterprise' });
      } else if (planStr.includes('professional')) {
        planDoc = await SuperAdminPlan.findOne({ matchKey: 'professional' });
      } else if (planStr.includes('basic') || planStr.includes('standard')) {
        planDoc = await SuperAdminPlan.findOne({ matchKey: 'basic' });
      } else {
        planDoc = await SuperAdminPlan.findOne({
          $or: [
            { tier: new RegExp(`^${hospital.plan}$`, 'i') },
            { matchKey: planStr }
          ]
        });
      }
    }
  } catch (e) {
    // Gracefully handle model resolution or db error in test/dev
  }


  if (planDoc && Array.isArray(planDoc.modules) && planDoc.modules.length > 0) {
    return planDoc.modules.map(m => String(m).toLowerCase().trim());
  }

  // Fallback defaults
  if (subPlan === 'trial' || subPlan === 'custom' || planStr.includes('trial')) {
    return DEFAULT_PLAN_MODULES.trial;
  } else if (planStr.includes('enterprise')) {
    return DEFAULT_PLAN_MODULES.enterprise;
  } else if (planStr.includes('professional')) {
    return DEFAULT_PLAN_MODULES.professional;
  } else if (planStr.includes('basic') || planStr.includes('standard')) {
    return DEFAULT_PLAN_MODULES.basic;
  }

  return FOUR_CORE_MODULES;
}

/**
 * Computes effective module access for a hospital:
 * Effective Module Access = Plan Allows Module AND Hospital Module Setting Allows Module.
 *
 * Only authoritative for the 4 core modules:
 * - 'reception'
 * - 'doctor'
 * - 'pharmacy'
 * - 'laboratory'
 *
 * Other non-core modules (e.g. inventory, dpdp) pass through from hospital.modules.
 *
 * @param {Object} hospital - SuperAdminHospital document or plain object
 * @returns {Promise<Object>} Effective modules map
 */
async function getHospitalEffectiveModules(hospital) {
  if (!hospital) {
    return {
      reception: { enabled: true, planIncluded: true, hospitalConfigured: true },
      doctor: { enabled: true, planIncluded: true, hospitalConfigured: true },
      pharmacy: { enabled: true, planIncluded: true, hospitalConfigured: true },
      laboratory: { enabled: true, planIncluded: true, hospitalConfigured: true }
    };
  }

  const planModules = await getPlanModuleEntitlements(hospital);
  const effective = {};

  for (const mod of FOUR_CORE_MODULES) {
    const planAllows = planModules.includes(mod);
    const hospitalSetting = hospital.modules && hospital.modules[mod] && hospital.modules[mod].enabled !== undefined
      ? hospital.modules[mod].enabled !== false
      : true;

    effective[mod] = {
      enabled: Boolean(planAllows && hospitalSetting),
      planIncluded: planAllows,
      hospitalConfigured: hospitalSetting,
      lastMod: hospital.modules?.[mod]?.lastMod || null
    };
  }

  // Preserve non-core modules if any exist in hospital.modules (e.g. inventory, dpdp)
  if (hospital.modules) {
    for (const [key, val] of Object.entries(hospital.modules)) {
      if (!FOUR_CORE_MODULES.includes(key) && !effective[key]) {
        effective[key] = val;
      }
    }
  }

  // Supply inventory is inherently linked with Pharmacy & Reception operations
  if (!effective.inventory) {
    effective.inventory = {
      enabled: Boolean(effective.pharmacy?.enabled || effective.reception?.enabled || true),
      planIncluded: true,
      hospitalConfigured: true
    };
  }

  return effective;
}

module.exports = {
  isTrialPlan,
  hasHospitalUsedTrial,
  getHospitalSubscriptionDates,
  getHospitalSubscriptionStatus,
  checkAndDispatchExpiryNotifications,
  getPlanModuleEntitlements,
  getHospitalEffectiveModules,
  FOUR_CORE_MODULES
};

