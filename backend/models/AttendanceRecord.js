const mongoose = require('mongoose');

const attendanceRecordSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    default: 'city_hospital',
    index: true
  },
  employeeId: {
    type: String,
    required: true
  },
  employeeName: {
    type: String,
    required: true
  },
  date: {
    type: String,
    required: true
  },
  clockIn: {
    type: String,
    default: ''
  },
  clockOut: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    required: true,
    enum: ['Present', 'Absent', 'Late', 'Half-Day', 'On Leave', 'Leave', 'Holiday', 'Work From Home', 'Off'],
    default: 'Present'
  },
  workHours: {
    type: Number,
    default: 0
  },
  overtime: {
    type: Number,
    default: 0
  },
  device: {
    type: String,
    default: 'Web Portal'
  },
  location: {
    type: String,
    default: 'Main Wing'
  },
  correctionRequested: {
    type: Boolean,
    default: false
  },
  correctionStatus: {
    type: String,
    default: ''
  },
  correctionPunchIn: {
    type: String,
    default: ''
  },
  correctionPunchOut: {
    type: String,
    default: ''
  },
  correctionReason: {
    type: String,
    default: ''
  }
}, { timestamps: true });

// Ensure unique record per employee per date
attendanceRecordSchema.index({ tenantId: 1, employeeId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('AttendanceRecord', attendanceRecordSchema);
