const mongoose = require('mongoose');
const User = require('../models/User');
const Patient = require('../models/Patient');
const DoctorQueue = require('../models/DoctorQueue');
const Appointment = require('../models/Appointment');


const cleanTimeSlot = (timeStr) => {
  if (!timeStr) return '';
  return timeStr.split(/\(Limit:/i)[0].replace(/\s+/g, ' ').trim();
};

const normalizeDateString = (dateInput) => {
  if (!dateInput) return new Date().toISOString().split('T')[0];
  if (typeof dateInput === 'string') {
    // If format is YYYY-MM-DD, return directly
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
      return dateInput.trim();
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    return new Date().toISOString().split('T')[0];
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const DEFAULT_SLOTS = [
  '09:00 AM - 09:30 AM',
  '09:30 AM - 10:00 AM',
  '10:00 AM - 10:30 AM',
  '10:30 AM - 11:00 AM',
  '11:00 AM - 11:30 AM',
  '11:30 AM - 12:00 PM',
  '12:00 PM - 12:30 PM',
  '12:30 PM - 01:00 PM',
  '02:00 PM - 02:30 PM',
  '02:30 PM - 03:00 PM',
  '03:00 PM - 03:30 PM',
  '03:30 PM - 04:00 PM',
  '04:00 PM - 04:30 PM',
  '04:30 PM - 05:00 PM',
  '05:00 PM - 05:30 PM'
];

/**
 * Dynamically computes slot token ranges for a doctor based on configured capacities.
 * Starting token for a slot is: previous slot ending token + 1.
 * There are NO hardcoded token boundaries.
 */
const getDoctorSlotRanges = (doctorObj) => {
  if (!doctorObj) {
    throw new Error('Doctor profile not found for slot range calculation');
  }

  const defaultLimit = doctorObj.max_slots && doctorObj.max_slots > 0 ? doctorObj.max_slots : 10;
  const configuredSlots = (doctorObj.doctorSlots && doctorObj.doctorSlots.length > 0)
    ? doctorObj.doctorSlots
    : DEFAULT_SLOTS;

  let currentStartToken = 1;
  const slotRanges = [];

  for (let i = 0; i < configuredSlots.length; i++) {
    const rawSlot = configuredSlots[i];
    const cleanSlot = cleanTimeSlot(rawSlot);

    let capacity = defaultLimit;
    const match = rawSlot.match(/\(Limit:\s*(\d+)\)/i);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (!isNaN(parsed) && parsed > 0) {
        capacity = parsed;
      }
    }

    const startToken = currentStartToken;
    const endToken = startToken + capacity - 1;

    slotRanges.push({
      slotIndex: i,
      slotKey: `slot_${i}`,
      rawSlot,
      cleanSlot,
      capacity,
      startToken,
      endToken
    });

    currentStartToken = endToken + 1;
  }

  return slotRanges;
};

/**
 * Finds the slot matching a given time string for a doctor.
 */
const matchSlotForTime = (slotRanges, timeStr) => {
  if (!timeStr) return slotRanges[0] || null;
  const targetClean = cleanTimeSlot(timeStr).toLowerCase();

  const exactMatch = slotRanges.find(s => s.cleanSlot.toLowerCase() === targetClean);
  if (exactMatch) return exactMatch;

  // Partial or normalized fallback match
  const partialMatch = slotRanges.find(s => {
    const sClean = s.cleanSlot.toLowerCase();
    return sClean.includes(targetClean) || targetClean.includes(sClean);
  });
  if (partialMatch) return partialMatch;

  // Fallback to first configured slot
  return slotRanges[0] || null;
};

/**
 * Atomically allocates the next sequential token for a doctor on a calendar date in a slot.
 * Ensures zero race conditions, strict tenant isolation, and date isolation.
 */
const allocateDoctorToken = async ({ tenantId, doctorId, date, time }) => {
  if (!tenantId) throw new Error('Tenant ID is required for token allocation');
  if (!doctorId) throw new Error('Doctor ID is required for token allocation');

  const normalizedTenant = String(tenantId).trim().toLowerCase();
  const dateStr = normalizeDateString(date);

  const doctorObj = await User.findById(doctorId);
  if (!doctorObj) {
    throw new Error('Doctor not found');
  }

  const slotRanges = getDoctorSlotRanges(doctorObj);
  const targetSlot = matchSlotForTime(slotRanges, time);
  if (!targetSlot) {
    throw new Error('No valid time slot available for this doctor');
  }

  const slotKey = targetSlot.slotKey;
  const slotStart = targetSlot.startToken;
  const slotCapacity = targetSlot.capacity;
  const slotEnd = targetSlot.endToken;

  // Ensure the DoctorQueue document for (tenantId, doctorId, dateStr) exists
  try {
    await DoctorQueue.updateOne(
      { tenantId: normalizedTenant, doctorId, date: dateStr },
      {
        $setOnInsert: {
          tenantId: normalizedTenant,
          doctorId,
          date: dateStr,
          currentToken: null,
          currentAppointmentId: null,
          nextToken: null,
          waitingCount: 0,
          lastIssuedToken: 0,
          slotCounters: {}
        }
      },
      { upsert: true }
    );
  } catch (upsertErr) {
    if (upsertErr.code !== 11000 && !upsertErr.message?.includes('E11000')) {
      throw upsertErr;
    }
  }

  // Atomic findOneAndUpdate with capacity check on slot counter
  const queueDoc = await DoctorQueue.findOneAndUpdate(
    {
      tenantId: normalizedTenant,
      doctorId,
      date: dateStr,
      $or: [
        { [`slotCounters.${slotKey}`]: { $exists: false } },
        { [`slotCounters.${slotKey}`]: { $lt: slotCapacity } }
      ]
    },
    {
      $inc: { [`slotCounters.${slotKey}`]: 1 }
    },
    {
      returnDocument: 'after'
    }
  );

  if (!queueDoc) {
    throw new Error(`Slot '${targetSlot.cleanSlot}' has reached its maximum capacity of ${slotCapacity} patients for ${dateStr}.`);
  }

  // Get the counter value for this slot
  const slotCount = queueDoc.slotCounters ? (
    typeof queueDoc.slotCounters.get === 'function'
      ? queueDoc.slotCounters.get(slotKey)
      : queueDoc.slotCounters[slotKey]
  ) : 1;

  const tokenNumber = slotStart + (slotCount - 1);

  if (tokenNumber > slotEnd) {
    throw new Error(`Allocated token ${tokenNumber} exceeds slot ending boundary ${slotEnd}`);
  }

  // Update lastIssuedToken if higher
  if (!queueDoc.lastIssuedToken || tokenNumber > queueDoc.lastIssuedToken) {
    queueDoc.lastIssuedToken = tokenNumber;
  }

  // If no patient is currently serving, initialize currentToken to this token
  if (queueDoc.currentToken === null) {
    queueDoc.currentToken = tokenNumber;
  }

  await queueDoc.save();

  // Refresh live queue calculations
  await syncDoctorQueueState(normalizedTenant, doctorId, dateStr);

  return {
    tokenNumber,
    tokenDisplay: String(tokenNumber),
    tokenDate: dateStr,
    tokenDoctorId: doctorId,
    tokenSlotId: targetSlot.cleanSlot,
    tokenAssignedAt: new Date(),
    queueStatus: 'Waiting',
    slotRange: {
      slotIndex: targetSlot.slotIndex,
      slotTime: targetSlot.cleanSlot,
      startToken: targetSlot.startToken,
      endToken: targetSlot.endToken,
      capacity: targetSlot.capacity
    },
    queueDoc
  };
};

/**
 * Returns all active, eligible checked-in appointments for a doctor on a specific date,
 * sorted by tokenNumber ascending.
 * Filters out Completed, Cancelled, and No-Show appointments.
 */
const getEligibleQueueAppointments = async (tenantId, doctorId, date) => {
  const normalizedTenant = String(tenantId).trim().toLowerCase();
  const dateStr = normalizeDateString(date);

  const startOfDay = new Date(`${dateStr}T00:00:00.000Z`);
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`);

  return await Appointment.find({
    tenantId: normalizedTenant,
    doctorId: doctorId,
    tokenNumber: { $ne: null },
    $or: [
      { tokenDate: dateStr },
      { date: { $gte: startOfDay, $lte: endOfDay } }
    ],
    status: { $nin: ['Completed', 'Cancelled', 'Checked Out', 'No-Show', 'no-show'] },
    queueStatus: { $nin: ['Completed', 'Cancelled', 'No-Show', 'no-show'] }
  })
    .populate('patientId')
    .sort({ tokenNumber: 1 });
};

/**
 * Recalculates and updates currentToken, currentAppointmentId, nextToken, and waitingCount
 * for a doctor on a given date.
 */
const syncDoctorQueueState = async (tenantId, doctorId, date) => {
  const normalizedTenant = String(tenantId).trim().toLowerCase();
  const dateStr = normalizeDateString(date);

  const eligibleList = await getEligibleQueueAppointments(normalizedTenant, doctorId, dateStr);

  let currentToken = null;
  let currentAppointment = null;
  let nextToken = null;
  let waitingCount = 0;

  if (eligibleList.length > 0) {
    // Check if there is an appointment explicitly marked as 'Serving'
    const servingApp = eligibleList.find(a => a.queueStatus === 'Serving');

    if (servingApp) {
      currentAppointment = servingApp;
      currentToken = servingApp.tokenNumber;
    } else {
      // First eligible appointment becomes currently serving
      currentAppointment = eligibleList[0];
      currentToken = eligibleList[0].tokenNumber;
      if (currentAppointment.queueStatus !== 'Serving') {
        currentAppointment.queueStatus = 'Serving';
        await currentAppointment.save();
      }
    }

    // Remaining appointments after current one
    const remainingAfterCurrent = eligibleList.filter(a => a._id.toString() !== currentAppointment._id.toString());
    nextToken = remainingAfterCurrent.length > 0 ? remainingAfterCurrent[0].tokenNumber : null;
    waitingCount = remainingAfterCurrent.length;
  }

  // Update DoctorQueue document atomically
  const updatedQueue = await DoctorQueue.findOneAndUpdate(
    { tenantId: normalizedTenant, doctorId, date: dateStr },
    {
      $set: {
        currentToken,
        currentAppointmentId: currentAppointment ? currentAppointment._id : null,
        nextToken,
        waitingCount
      }
    },
    { returnDocument: 'after', upsert: true }
  );

  return {
    queue: updatedQueue,
    currentToken,
    currentAppointment,
    nextToken,
    waitingCount,
    eligibleAppointments: eligibleList
  };
};

/**
 * Atomically advances the doctor's queue when a consultation is completed.
 * Concurrency-safe: duplicate completion calls will not advance the queue multiple times.
 */
const advanceDoctorQueue = async ({ tenantId, doctorId, appointmentId }) => {
  if (!tenantId) throw new Error('Tenant ID is required for queue advancement');
  if (!doctorId) throw new Error('Doctor ID is required for queue advancement');
  if (!appointmentId) throw new Error('Appointment ID is required for queue advancement');

  const normalizedTenant = String(tenantId).trim().toLowerCase();

  // Find the appointment and verify ownership
  const appointment = await Appointment.findOne({
    _id: appointmentId,
    tenantId: normalizedTenant
  });

  if (!appointment) {
    throw new Error('Appointment not found or not in tenant scope');
  }

  if (String(appointment.doctorId) !== String(doctorId)) {
    throw new Error('Appointment does not belong to the specified doctor');
  }

  const dateStr = appointment.tokenDate || normalizeDateString(appointment.date);

  // Mark appointment as Completed atomically
  appointment.status = 'Completed';
  appointment.queueStatus = 'Completed';
  await appointment.save();

  // Recalculate queue state
  const syncedState = await syncDoctorQueueState(normalizedTenant, doctorId, dateStr);

  return {
    success: true,
    completedAppointment: appointment,
    queueState: syncedState
  };
};

/**
 * Retrieves full live doctor queue state and details for rendering in Doctor, Reception, and Patient dashboards.
 */
const getDoctorQueueState = async (tenantId, doctorId, date, patientToken = null) => {
  const normalizedTenant = String(tenantId).trim().toLowerCase();
  const dateStr = normalizeDateString(date);

  // Ensure queue state is synchronized with DB appointments
  const syncResult = await syncDoctorQueueState(normalizedTenant, doctorId, dateStr);
  const queueDoc = syncResult.queue;

  const currentApp = syncResult.currentAppointment;
  let currentPatient = null;
  if (currentApp && currentApp.patientId) {
    currentPatient = typeof currentApp.patientId === 'object'
      ? currentApp.patientId
      : { _id: currentApp.patientId };
  }

  // Calculate exact number of eligible waiting patients ahead of patientToken
  let patientsAhead = null;
  if (patientToken !== null && patientToken !== undefined && !isNaN(Number(patientToken))) {
    const targetToken = Number(patientToken);
    if (syncResult.currentToken === targetToken) {
      patientsAhead = 0;
    } else {
      // Find eligible waiting appointments whose token is strictly less than targetToken
      // excluding the currently serving appointment (which is already in consultation)
      const currentAppIdStr = currentApp ? currentApp._id.toString() : '';
      const aheadList = syncResult.eligibleAppointments.filter(app => {
        const tNum = app.tokenNumber;
        return tNum < targetToken && app._id.toString() !== currentAppIdStr;
      });
      patientsAhead = aheadList.length;
    }
  }

  return {
    tenantId: normalizedTenant,
    doctorId,
    date: dateStr,
    currentToken: syncResult.currentToken,
    currentAppointmentId: syncResult.currentAppointment ? syncResult.currentAppointment._id : null,
    currentPatient: currentPatient ? {
      _id: currentPatient._id,
      name: currentPatient.name,
      age: currentPatient.age,
      gender: currentPatient.gender,
      contact: currentPatient.contact
    } : null,
    nextToken: syncResult.nextToken,
    waitingCount: syncResult.waitingCount,
    patientsAhead,
    lastIssuedToken: queueDoc.lastIssuedToken || 0,
    slotCounters: queueDoc.slotCounters || {},
    queueAppointments: (syncResult.eligibleAppointments || []).map(a => {
      const p = a.patientId;
      return {
        _id: a._id,
        tokenNumber: a.tokenNumber,
        tokenDisplay: a.tokenDisplay || String(a.tokenNumber),
        tokenSlotId: a.tokenSlotId,
        patientName: (p && typeof p === 'object' && p.name) ? p.name : 'Patient',
        patientId: (p && typeof p === 'object' && p._id) ? p._id : p,
        contact: (p && typeof p === 'object') ? p.contact : undefined,
        age: (p && typeof p === 'object') ? p.age : undefined,
        gender: (p && typeof p === 'object') ? p.gender : undefined,
        time: a.time,
        status: a.status,
        queueStatus: a.queueStatus || (a.tokenNumber === syncResult.currentToken ? 'Serving' : 'Waiting')
      };
    })
  };
};



module.exports = {
  cleanTimeSlot,
  normalizeDateString,
  getDoctorSlotRanges,
  matchSlotForTime,
  allocateDoctorToken,
  getEligibleQueueAppointments,
  syncDoctorQueueState,
  advanceDoctorQueue,
  getDoctorQueueState
};
