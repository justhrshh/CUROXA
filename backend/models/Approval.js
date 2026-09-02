const mongoose = require('mongoose');

const approvalSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, default: 'city_hospital', index: true },
  type: {
    type: String,
    enum: ['staff_signup', 'password_reset', 'role_change', 'permission_request', 'receptionist_indent', 'vendor_onboarding', 'item_price_update', 'purchase_order_approval', 'vendor_medicine_addition', 'leave_allocation'],
    required: true
  },
  staffId: { type: String, required: false },
  requesterName: { type: String, required: true },
  requesterRole: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'approved', 'denied'],
    default: 'pending',
    index: true
  },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  requestedAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date },
  resolvedBy: { type: String, default: '' },
  comment: { type: String, default: '' }
}, { timestamps: true });

approvalSchema.index({ tenantId: 1, status: 1, requestedAt: -1 });

module.exports = mongoose.model('Approval', approvalSchema);
