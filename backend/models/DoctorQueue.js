const mongoose = require('mongoose');

const doctorQueueSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    default: 'city_hospital',
    index: true,
    lowercase: true,
    trim: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  date: {
    type: String, // YYYY-MM-DD calendar date string
    required: true,
    index: true
  },
  currentToken: {
    type: Number,
    default: null
  },
  currentAppointmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Appointment',
    default: null
  },
  nextToken: {
    type: Number,
    default: null
  },
  waitingCount: {
    type: Number,
    default: 0
  },
  lastIssuedToken: {
    type: Number,
    default: 0
  },
  // Tracks issued tokens count per slot key (e.g., "slot_0": 5)
  slotCounters: {
    type: Map,
    of: Number,
    default: {}
  }
}, { timestamps: true });

// Authoritative unique index: exactly one queue state document per (tenantId, doctorId, calendar date)
doctorQueueSchema.index({ tenantId: 1, doctorId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('DoctorQueue', doctorQueueSchema);
