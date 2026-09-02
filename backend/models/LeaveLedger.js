const mongoose = require('mongoose');

const leaveLedgerSchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    index: true,
    lowercase: true,
    trim: true
  },
  employeeId: {
    type: String,
    required: true,
    index: true,
    trim: true
  },
  year: {
    type: Number,
    required: true,
    index: true
  },
  leaveType: {
    type: String,
    required: true,
    trim: true
  },
  leaveTypeCode: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  transactionType: {
    type: String,
    required: true,
    enum: [
      'OPENING',
      'MONTHLY_ACCRUAL',
      'CARRY_FORWARD',
      'APPROVED_CONSUMPTION',
      'CONSUMPTION_REVERSAL',
      'ADJUSTMENT'
    ]
  },
  amount: {
    type: Number,
    required: true
  },
  month: {
    type: Number,
    min: 1,
    max: 12,
    default: null
  },
  reason: {
    type: String,
    default: ''
  },
  leaveRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LeaveRequest',
    default: null
  },
  actor: {
    type: String,
    default: 'System'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { timestamps: true });

// Compound indexes for fast audit lookup & idempotency
leaveLedgerSchema.index({ tenantId: 1, employeeId: 1, year: 1 });
leaveLedgerSchema.index({ tenantId: 1, employeeId: 1, year: 1, leaveTypeCode: 1 });
leaveLedgerSchema.index({ tenantId: 1, leaveRequestId: 1 });

module.exports = mongoose.model('LeaveLedger', leaveLedgerSchema);
