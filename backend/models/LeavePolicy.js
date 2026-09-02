const mongoose = require('mongoose');

const leaveTypeConfigSchema = new mongoose.Schema({
  leaveType: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  paid: {
    type: Boolean,
    default: true
  },
  monthlyAccrual: {
    type: Number,
    default: 0,
    min: 0
  },
  annualEntitlement: {
    type: Number,
    default: 0,
    min: 0
  },
  carryForward: {
    type: Boolean,
    default: false
  },
  maxCarryForward: {
    type: Number,
    default: 0,
    min: 0
  },
  allowEncashment: {
    type: Boolean,
    default: false
  },
  description: {
    type: String,
    default: ''
  },
  enabled: {
    type: Boolean,
    default: true
  }
}, { _id: false });

const leavePolicySchema = new mongoose.Schema({
  tenantId: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  leaveTypes: {
    type: [leaveTypeConfigSchema],
    default: () => [
      {
        leaveType: 'Sick Leave',
        code: 'SICK',
        paid: true,
        monthlyAccrual: 0.5,
        annualEntitlement: 6,
        carryForward: true,
        maxCarryForward: 15,
        description: 'Medical emergency and recovery.',
        enabled: true
      },
      {
        leaveType: 'Casual Leave',
        code: 'CASUAL',
        paid: true,
        monthlyAccrual: 0.5,
        annualEntitlement: 6,
        carryForward: false,
        maxCarryForward: 0,
        description: 'Personal affairs, travel, or unplanned personal engagements.',
        enabled: true
      },
      {
        leaveType: 'Earned Leave',
        code: 'EARNED',
        paid: true,
        monthlyAccrual: 1.25,
        annualEntitlement: 15,
        carryForward: true,
        maxCarryForward: 30,
        description: 'Pre-planned vacations and earned tenure leaves.',
        enabled: true
      },
      {
        leaveType: 'Maternity Leave',
        code: 'MATERNITY',
        paid: true,
        monthlyAccrual: 0,
        annualEntitlement: 90,
        carryForward: false,
        maxCarryForward: 0,
        description: 'Fully paid medical prenatal and postnatal care leave.',
        enabled: true
      },
      {
        leaveType: 'Paternity Leave',
        code: 'PATERNITY',
        paid: true,
        monthlyAccrual: 0,
        annualEntitlement: 14,
        carryForward: false,
        maxCarryForward: 0,
        description: 'Paid childcare leave for new fathers.',
        enabled: true
      },
      {
        leaveType: 'Comp Off',
        code: 'COMP_OFF',
        paid: true,
        monthlyAccrual: 0,
        annualEntitlement: 0,
        carryForward: false,
        maxCarryForward: 0,
        description: 'Earned compensatory leaves in lieu of emergency weekend/holiday duty.',
        enabled: true
      },
      {
        leaveType: 'Loss of Pay',
        code: 'LWP',
        paid: false,
        monthlyAccrual: 0,
        annualEntitlement: 0,
        carryForward: false,
        maxCarryForward: 0,
        description: 'Unpaid leave of absence.',
        enabled: true
      }
    ]
  },
  fiscalOrCalendar: {
    type: String,
    enum: ['calendar', 'fiscal'],
    default: 'calendar'
  },
  updatedBy: {
    type: String,
    default: 'System'
  }
}, { timestamps: true });

leavePolicySchema.index({ tenantId: 1 }, { unique: true });

module.exports = mongoose.model('LeavePolicy', leavePolicySchema);
