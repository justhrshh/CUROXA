const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Kolkata';

/**
 * Extracts and parses the start time of a time slot.
 * Supports:
 * - "09:00 AM - 09:30 AM" -> { hours: 9, minutes: 0 }
 * - "08:30 PM - 09:00 PM (Limit: 5)" -> { hours: 20, minutes: 30 }
 * - "08:30 PM" -> { hours: 20, minutes: 30 }
 * - "14:30 - 15:00" -> { hours: 14, minutes: 30 }
 * - "14:30" -> { hours: 14, minutes: 30 }
 */
function parseSlotStartTime(slotStr) {
  if (!slotStr || typeof slotStr !== 'string') return null;
  const clean = slotStr.split(/\(Limit:/i)[0].replace(/[()]/g, '').trim();
  const startTimeStr = clean.split('-')[0].trim();
  const match = startTimeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const modifier = match[3] ? match[3].toUpperCase() : null;

  if (modifier === 'PM' && hours < 12) {
    hours += 12;
  } else if (modifier === 'AM' && hours === 12) {
    hours = 0;
  }

  return { hours, minutes };
}

/**
 * Formats a given Date, ISO string, or YYYY-MM-DD string into YYYY-MM-DD
 * in the configured application timezone (default Asia/Kolkata).
 */
function getAppTimezoneDateStr(dateInput = new Date()) {
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
  }
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

/**
 * Returns the current date and time components in the configured application timezone.
 */
function getAppTimezoneNow(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(d);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  let hour = parseInt(map.hour, 10);
  if (hour === 24) hour = 0;
  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour,
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
    dateStr: `${map.year}-${map.month}-${map.day}`,
    totalMinutes: hour * 60 + parseInt(map.minute, 10)
  };
}

/**
 * Validates whether an appointment slot date and time are eligible for registration.
 * Rule: selectedSlotDateTime >= currentServerDateTime
 * - Past dates: rejected.
 * - Future dates: accepted.
 * - Today: slot start time must be >= current server time in application timezone.
 */
function isSlotValidForRegistration(dateInput, slotStr, now = new Date()) {
  const targetDateStr = getAppTimezoneDateStr(dateInput);
  if (!targetDateStr) {
    return { valid: false, reason: 'Invalid appointment date format' };
  }
  const serverNow = getAppTimezoneNow(now);

  if (targetDateStr < serverNow.dateStr) {
    return { valid: false, reason: 'Cannot register or book into a past date' };
  }

  if (targetDateStr > serverNow.dateStr) {
    return { valid: true };
  }

  // Same calendar date (Today)
  const slotTime = parseSlotStartTime(slotStr);
  if (!slotTime) {
    return { valid: false, reason: 'Invalid or missing time slot format' };
  }

  const slotTotalMinutes = slotTime.hours * 60 + slotTime.minutes;
  if (slotTotalMinutes < serverNow.totalMinutes) {
    return { valid: false, reason: 'Cannot register or book into a past time slot' };
  }

  return { valid: true };
}

module.exports = {
  APP_TIMEZONE,
  parseSlotStartTime,
  getAppTimezoneDateStr,
  getAppTimezoneNow,
  isSlotValidForRegistration
};
