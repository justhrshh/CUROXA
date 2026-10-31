const crypto = require('crypto');
const Counter = require('../models/Counter');
const ReceptionQueue = require('../models/ReceptionQueue');

/**
 * Normalizes date to YYYY-MM-DD
 */
const normalizeQueueDate = (dateInput) => {
  if (!dateInput) return new Date().toISOString().split('T')[0];
  if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return dateInput.trim();
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

/**
 * Atomically allocates a sequential reception queue ticket.
 * Enforces per-clinic, per-date sequence isolation and concurrency protection.
 * 
 * @param {Object} params
 * @param {string} params.tenantId - Canonical hospital tenant identifier
 * @param {string} params.clinicCode - Clinic code from QR URL
 * @param {string} params.queueDate - YYYY-MM-DD date string
 * @param {string} params.patientType - 'Existing' | 'New'
 * @param {string} [params.patientId] - Patient ObjectId (existing patients only)
 * @param {Object} [params.existingPatientDetails] - Non-sensitive patient summary
 * @param {Object} [params.preliminaryDetails] - Name, contact, age/gender for new patients
 * @param {string} [params.idempotencyKey] - Client submission key to prevent double submits
 * @returns {Promise<Object>} Created ReceptionQueue document
 */
async function allocateReceptionTicket({
  tenantId,
  clinicCode,
  queueDate,
  patientType,
  patientId = null,
  existingPatientDetails = null,
  preliminaryDetails = null,
  idempotencyKey = null
}) {
  const normDate = normalizeQueueDate(queueDate);
  const cleanTenant = String(tenantId).trim();
  const cleanClinicCode = String(clinicCode).trim().toLowerCase();

  // 1. Idempotency Check: if idempotencyKey supplied, check if ticket already allocated
  if (idempotencyKey) {
    const existingTicket = await ReceptionQueue.findOne({
      tenantId: cleanTenant,
      idempotencyKey: String(idempotencyKey).trim()
    });
    if (existingTicket) {
      return existingTicket;
    }
  }

  // 2. Existing Patient Deduplication: check if patient already has active waiting/serving ticket today
  if (patientId && patientType === 'Existing') {
    const activeTicket = await ReceptionQueue.findOne({
      tenantId: cleanTenant,
      patientId,
      queueDate: normDate,
      status: { $in: ['Waiting', 'Called', 'Serving'] }
    });
    if (activeTicket) {
      return activeTicket;
    }
  }

  // 3. New Patient Deduplication: check by verified email in preliminaryDetails
  if (patientType === 'New' && preliminaryDetails?.email) {
    const activeTicket = await ReceptionQueue.findOne({
      tenantId: cleanTenant,
      'preliminaryDetails.email': preliminaryDetails.email.toLowerCase().trim(),
      queueDate: normDate,
      status: { $in: ['Waiting', 'Called', 'Serving'] }
    });
    if (activeTicket) {
      return activeTicket;
    }
  }

  // 4. Atomic Ticket Sequence Allocation
  const counterKey = `reception_queue_${cleanTenant}_${normDate}`;
  const counterDoc = await Counter.findOneAndUpdate(
    { key: counterKey },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const ticketNumber = counterDoc.seq;
  const ticketDisplay = `R-${String(ticketNumber).padStart(3, '0')}`;
  const sessionToken = crypto.randomBytes(32).toString('hex');

  // 5. Persist ReceptionQueue Record
  const ticketDocData = {
    tenantId: cleanTenant,
    clinicCode: cleanClinicCode,
    queueDate: normDate,
    ticketNumber,
    ticketDisplay,
    status: 'Waiting',
    patientType,
    patientId: patientId || null,
    existingPatientDetails: existingPatientDetails || null,
    preliminaryDetails: preliminaryDetails || null,
    sessionToken,
    source: 'QR'
  };
  if (idempotencyKey && typeof idempotencyKey === 'string' && idempotencyKey.trim()) {
    ticketDocData.idempotencyKey = idempotencyKey.trim();
  }

  try {
    const newTicket = await ReceptionQueue.create(ticketDocData);
    return newTicket;
  } catch (err) {
    // Duplicate key recovery (e.g. race condition or counter mismatch)
    if (err.code === 11000) {
      console.warn('[RECEPTION QUEUE] Duplicate key detected, retrying atomic allocation...');
      const retryCounter = await Counter.findOneAndUpdate(
        { key: counterKey },
        { $inc: { seq: 1 } },
        { returnDocument: 'after' }
      );
      const retryNum = retryCounter.seq;
      const retryDisplay = `R-${String(retryNum).padStart(3, '0')}`;
      const retrySessionToken = crypto.randomBytes(32).toString('hex');

      const retryDocData = {
        ...ticketDocData,
        ticketNumber: retryNum,
        ticketDisplay: retryDisplay,
        sessionToken: retrySessionToken
      };

      return await ReceptionQueue.create(retryDocData);
    }
    throw err;
  }
}

/**
 * Calculates current reception queue metrics for a clinic.
 * Returns strictly sanitized, non-identifying operational summary.
 */
async function getReceptionQueueState(tenantId, queueDate) {
  const normDate = normalizeQueueDate(queueDate);
  const cleanTenant = String(tenantId).trim();

  // Find currently serving ticket (Serving or Called)
  const currentServingDoc = await ReceptionQueue.findOne({
    tenantId: cleanTenant,
    queueDate: normDate,
    status: { $in: ['Serving', 'Called'] }
  }).sort({ ticketNumber: -1 }).select('ticketNumber ticketDisplay status').lean();

  // Count tickets waiting
  const waitingCount = await ReceptionQueue.countDocuments({
    tenantId: cleanTenant,
    queueDate: normDate,
    status: 'Waiting'
  });

  // Total tickets issued today
  const totalCount = await ReceptionQueue.countDocuments({
    tenantId: cleanTenant,
    queueDate: normDate
  });

  return {
    queueDate: normDate,
    currentTicketNumber: currentServingDoc?.ticketNumber || null,
    currentTicketDisplay: currentServingDoc?.ticketDisplay || null,
    isServing: Boolean(currentServingDoc),
    waitingCount,
    totalIssuedToday: totalCount
  };
}

/**
 * Calculates patient's individual queue position based on their ticket.
 */
async function getPatientQueuePosition(ticketDoc) {
  if (!ticketDoc) return null;

  const { tenantId, queueDate, ticketNumber, status } = ticketDoc;

  // Calculate how many waiting tickets have a lower number (ahead in queue)
  let peopleAhead = 0;
  if (status === 'Waiting') {
    peopleAhead = await ReceptionQueue.countDocuments({
      tenantId,
      queueDate,
      status: 'Waiting',
      ticketNumber: { $lt: ticketNumber }
    });
  }

  const queueState = await getReceptionQueueState(tenantId, queueDate);

  return {
    peopleAhead,
    currentServingNumber: queueState.currentTicketNumber,
    currentServingDisplay: queueState.currentTicketDisplay,
    waitingCount: queueState.waitingCount,
    isServing: queueState.isServing
  };
}

/**
 * Broadcasts sanitized real-time queue update to the public reception room.
 * STRICT PRIVACY: Zero patient identifiers, names, or clinical data in broadcast payload.
 */
function broadcastReceptionQueueUpdate(io, clinicCode, tenantId, queueDate) {
  if (!io || !clinicCode) return;

  const normDate = normalizeQueueDate(queueDate);
  const cleanClinicCode = String(clinicCode).trim().toLowerCase();

  getReceptionQueueState(tenantId, normDate).then(queueState => {
    const sanitizedPayload = {
      clinicCode: cleanClinicCode,
      queueDate: normDate,
      currentTicketNumber: queueState.currentTicketNumber,
      currentTicketDisplay: queueState.currentTicketDisplay,
      waitingCount: queueState.waitingCount,
      lastUpdated: new Date().toISOString()
    };

    io.to(`public_reception:${cleanClinicCode}`).emit('reception_queue_updated', sanitizedPayload);
  }).catch(err => {
    console.warn('[RECEPTION QUEUE BROADCAST WARNING]:', err.message);
  });
}

/**
 * Retrieves comprehensive queue dataset for authorized staff operations.
 */
async function getStaffReceptionQueueData({ tenantId, queueDate }) {
  const normDate = normalizeQueueDate(queueDate);
  const cleanTenant = String(tenantId).trim();

  // 1. Current serving / called ticket
  const currentServing = await ReceptionQueue.findOne({
    tenantId: cleanTenant,
    queueDate: normDate,
    status: { $in: ['Serving', 'Called'] }
  }).populate('patientId', 'name contact uhId patientId').lean();

  // 2. Waiting tickets in queue order
  const waitingTickets = await ReceptionQueue.find({
    tenantId: cleanTenant,
    queueDate: normDate,
    status: 'Waiting'
  }).sort({ ticketNumber: 1 }).populate('patientId', 'name contact uhId patientId').lean();

  // 3. Skipped tickets (retained for recall or manual processing)
  const skippedTickets = await ReceptionQueue.find({
    tenantId: cleanTenant,
    queueDate: normDate,
    status: 'Skipped'
  }).sort({ ticketNumber: 1 }).populate('patientId', 'name contact uhId patientId').lean();

  // 4. Recently completed tickets today
  const completedTickets = await ReceptionQueue.find({
    tenantId: cleanTenant,
    queueDate: normDate,
    status: 'Completed'
  }).sort({ completedAt: -1 }).limit(50).populate('patientId', 'name contact uhId patientId').lean();

  const totalCount = await ReceptionQueue.countDocuments({
    tenantId: cleanTenant,
    queueDate: normDate
  });

  return {
    queueDate: normDate,
    currentServing: currentServing || null,
    waitingTickets,
    skippedTickets,
    completedTickets,
    metrics: {
      waitingCount: waitingTickets.length,
      servingCount: currentServing ? 1 : 0,
      skippedCount: skippedTickets.length,
      completedCount: completedTickets.length,
      totalToday: totalCount
    }
  };
}

// Async execution lock for serializing state changes per tenant + queueDate
const queueLocks = new Map();

async function withQueueLock(key, action) {
  const currentPromise = queueLocks.get(key) || Promise.resolve();
  let release;
  const nextPromise = new Promise(resolve => { release = resolve; });
  queueLocks.set(key, nextPromise);
  await currentPromise;
  try {
    return await action();
  } finally {
    release();
    if (queueLocks.get(key) === nextPromise) {
      queueLocks.delete(key);
    }
  }
}

/**
 * Concurrency-safe queue advancement.
 * If currently serving, completes the active ticket atomically, then promotes next waiting.
 * If idle, promotes the first eligible waiting ticket.
 */
async function advanceReceptionQueue({ tenantId, clinicCode, queueDate, currentTicketId = null }) {
  const normDate = normalizeQueueDate(queueDate);
  const cleanTenant = String(tenantId).trim();
  const lockKey = `${cleanTenant}_${normDate}`;

  return withQueueLock(lockKey, async () => {
    let completedTicket = null;

    // 1. Complete existing serving ticket if one exists
    if (currentTicketId) {
      completedTicket = await ReceptionQueue.findOneAndUpdate(
        {
          _id: currentTicketId,
          tenantId: cleanTenant,
          status: { $in: ['Serving', 'Called'] }
        },
        {
          $set: {
            status: 'Completed',
            completedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      );

      // Stale request guard: If the requested ticket was already completed/skipped by another desk
      if (!completedTicket) {
        const staleDoc = await ReceptionQueue.findOne({ _id: currentTicketId, tenantId: cleanTenant });
        if (staleDoc && ['Completed', 'Skipped', 'Cancelled'].includes(staleDoc.status)) {
          const activeServing = await ReceptionQueue.findOne({ tenantId: cleanTenant, queueDate: normDate, status: 'Serving' });
          return {
            completedTicket: staleDoc,
            nowServingTicket: activeServing,
            alreadyProcessed: true
          };
        }
      }
    } else {
      // Complete any currently serving ticket if found
      completedTicket = await ReceptionQueue.findOneAndUpdate(
        {
          tenantId: cleanTenant,
          queueDate: normDate,
          status: { $in: ['Serving', 'Called'] }
        },
        {
          $set: {
            status: 'Completed',
            completedAt: new Date()
          }
        },
        { returnDocument: 'after', sort: { ticketNumber: 1 } }
      );
    }

    // 2. Atomically promote next eligible waiting ticket
    // Protected by database-level unique partial index on { tenantId, queueDate } where status='Serving'
    let nextTicket = null;
    try {
      nextTicket = await ReceptionQueue.findOneAndUpdate(
        {
          tenantId: cleanTenant,
          queueDate: normDate,
          status: 'Waiting'
        },
        {
          $set: {
            status: 'Serving',
            servedAt: new Date()
          }
        },
        { returnDocument: 'after', sort: { ticketNumber: 1 } }
      );
    } catch (promoteErr) {
      // Catch E11000 duplicate key error across multi-process concurrency
      if (promoteErr.code === 11000) {
        nextTicket = await ReceptionQueue.findOne({
          tenantId: cleanTenant,
          queueDate: normDate,
          status: 'Serving'
        });
      } else {
        throw promoteErr;
      }
    }

    return {
      completedTicket,
      nowServingTicket: nextTicket
    };
  });
}

/**
 * Skips a patient ticket atomically and promotes the next waiting patient.
 * Skipped ticket is safely preserved in DB with dedicated skippedAt timestamp (distinguishable from cancelledAt).
 */
async function skipReceptionTicket({ tenantId, clinicCode, queueDate, ticketId = null }) {
  const normDate = normalizeQueueDate(queueDate);
  const cleanTenant = String(tenantId).trim();
  const lockKey = `${cleanTenant}_${normDate}`;

  return withQueueLock(lockKey, async () => {
    let skippedTicket = null;

    if (ticketId) {
      skippedTicket = await ReceptionQueue.findOneAndUpdate(
        {
          _id: ticketId,
          tenantId: cleanTenant,
          status: { $in: ['Serving', 'Called', 'Waiting'] }
        },
        {
          $set: {
            status: 'Skipped',
            skippedAt: new Date()
          }
        },
        { returnDocument: 'after' }
      );
    } else {
      // Default to current serving ticket
      skippedTicket = await ReceptionQueue.findOneAndUpdate(
        {
          tenantId: cleanTenant,
          queueDate: normDate,
          status: { $in: ['Serving', 'Called'] }
        },
        {
          $set: {
            status: 'Skipped',
            skippedAt: new Date()
          }
        },
        { returnDocument: 'after', sort: { ticketNumber: 1 } }
      );
    }

    // Promote next waiting ticket
    let nextTicket = null;
    try {
      nextTicket = await ReceptionQueue.findOneAndUpdate(
        {
          tenantId: cleanTenant,
          queueDate: normDate,
          status: 'Waiting'
        },
        {
          $set: {
            status: 'Serving',
            servedAt: new Date()
          }
        },
        { returnDocument: 'after', sort: { ticketNumber: 1 } }
      );
    } catch (promoteErr) {
      if (promoteErr.code === 11000) {
        nextTicket = await ReceptionQueue.findOne({
          tenantId: cleanTenant,
          queueDate: normDate,
          status: 'Serving'
        });
      } else {
        throw promoteErr;
      }
    }

    return {
      skippedTicket,
      nowServingTicket: nextTicket
    };
  });
}

/**
 * Marks ticket completed after desk processing (appointment / registration).
 */
async function completeReceptionTicket({ tenantId, ticketId, patientId = null }) {
  const cleanTenant = String(tenantId).trim();

  const updateFields = {
    status: 'Completed',
    completedAt: new Date()
  };
  if (patientId) {
    updateFields.patientId = patientId;
  }

  const completed = await ReceptionQueue.findOneAndUpdate(
    {
      _id: ticketId,
      tenantId: cleanTenant
    },
    { $set: updateFields },
    { returnDocument: 'after' }
  );

  return completed;
}

/**
 * Promotes a specific ticket to 'Serving' atomically.
 * If another ticket is currently 'Serving', it is safely demoted to 'Waiting'.
 */
async function serveReceptionTicket({ tenantId, clinicCode, queueDate, ticketId }) {
  const normDate = normalizeQueueDate(queueDate);
  const cleanTenant = String(tenantId).trim();
  const lockKey = `${cleanTenant}_${normDate}`;

  return withQueueLock(lockKey, async () => {
    // 1. Demote any other ticket that is currently 'Serving' or 'Called' to 'Waiting'
    await ReceptionQueue.updateMany(
      {
        tenantId: cleanTenant,
        queueDate: normDate,
        status: { $in: ['Serving', 'Called'] },
        _id: { $ne: ticketId }
      },
      {
        $set: { status: 'Waiting' }
      }
    );

    // 2. Atomically set this ticket to 'Serving'
    const servingTicket = await ReceptionQueue.findOneAndUpdate(
      {
        _id: ticketId,
        tenantId: cleanTenant
      },
      {
        $set: {
          status: 'Serving',
          servedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    return servingTicket;
  });
}

module.exports = {
  normalizeQueueDate,
  allocateReceptionTicket,
  getReceptionQueueState,
  getPatientQueuePosition,
  broadcastReceptionQueueUpdate,
  getStaffReceptionQueueData,
  advanceReceptionQueue,
  skipReceptionTicket,
  completeReceptionTicket,
  serveReceptionTicket
};
