const mongoose = require('mongoose');

const indentSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, default: 'city_hospital', index: true },
  indentId: { type: String, required: true },
  department: { type: String, required: true },
  indentType: { type: String, required: true },
  requiredDate: { type: Date, required: true },
  requestedBy: { type: String, required: true },
  contactNumber: { type: String },
  priority: { type: String, enum: ['Normal', 'Urgent'], default: 'Normal' },
  purpose: { type: String },
  additionalNotes: { type: String },
  attachments: [{ type: String }],
  items: [{
    name: { type: String, required: true },
    category: { type: String },
    unit: { type: String },
    requiredQty: { type: Number, required: true, default: 1 },
    approvedQty: { type: Number, default: null },
    suppliedQty: { type: Number, default: 0 },
    utilizedQty: { type: Number, default: 0 },
    availableStock: { type: Number, default: 0 },
    mrp: { type: Number, default: 50.00 }
  }],
  totalQty: { type: Number, required: true, default: 0 },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected', 'Draft', 'Received', 'Fulfilled', 'Partially Fulfilled', 'Cannot Fulfill', 'Awaiting Stock'], default: 'Pending' }
}, { timestamps: true });

// Compound unique index for local uniqueness within each tenant
indentSchema.index({ tenantId: 1, indentId: 1 }, { unique: true });

module.exports = mongoose.model('Indent', indentSchema);

