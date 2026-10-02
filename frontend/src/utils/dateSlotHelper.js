/**
 * dateSlotHelper.js
 * Frontend helpers for Doctor Slot date & time validation.
 * Enforces: selectedSlotDateTime >= currentServerDateTime (no backdated registration).
 */

/**
 * Returns today's calendar date as YYYY-MM-DD in user's local timezone.
 */
export const getLocalDateString = (d = new Date()) => {
  const dateObj = d instanceof Date ? d : new Date(d);
  if (isNaN(dateObj.getTime())) return '';
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Parses the starting time of a time slot.
 * Handles formats:
 * - "09:00 AM - 09:30 AM"
 * - "08:30 PM - 09:00 PM (Limit: 5)"
 * - "08:30 PM"
 * - "14:30 - 15:00"
 * - "14:30"
 */
export const parseSlotStartTime = (slotStr) => {
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
};

/**
 * Determines whether a given slot on a given date is in the past.
 * - Dates before today: returns true
 * - Dates after today: returns false
 * - Today: returns true if slot start time < current time
 */
export const isPastSlot = (dateInput, slotStr, now = new Date()) => {
  if (!dateInput || !slotStr) return false;
  const targetDateStr = getLocalDateString(dateInput);
  const todayStr = getLocalDateString(now);

  if (targetDateStr < todayStr) return true;
  if (targetDateStr > todayStr) return false;

  const slotTime = parseSlotStartTime(slotStr);
  if (!slotTime) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const slotMinutes = slotTime.hours * 60 + slotTime.minutes;
  return slotMinutes < currentMinutes;
};

/**
 * Validates whether an appointment slot date and time can be registered/booked.
 */
export const isSlotValidForRegistration = (dateInput, slotStr, now = new Date()) => {
  if (!dateInput) {
    return { valid: false, reason: 'Please select an appointment date.' };
  }
  if (!slotStr) {
    return { valid: false, reason: 'Please select a time slot.' };
  }

  const targetDateStr = getLocalDateString(dateInput);
  const todayStr = getLocalDateString(now);

  if (targetDateStr < todayStr) {
    return { valid: false, reason: 'Cannot register or book into a past date.' };
  }

  if (targetDateStr > todayStr) {
    return { valid: true };
  }

  const slotTime = parseSlotStartTime(slotStr);
  if (!slotTime) {
    return { valid: false, reason: 'Invalid time slot format.' };
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const slotMinutes = slotTime.hours * 60 + slotTime.minutes;

  if (slotMinutes < currentMinutes) {
    return { valid: false, reason: 'Cannot register or book into a past time slot.' };
  }

  return { valid: true };
};
