const mongoose = require('mongoose');

const labRequestSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, default: 'city_hospital', index: true },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  testName: { type: String, required: true },
  notes: { type: String },
  status: { type: String, enum: ['Pending', 'In Progress', 'Completed'], default: 'Pending' },
  results: { type: String },
  labId: { type: mongoose.Schema.Types.ObjectId, ref: 'LaboratoryMaster', index: true },
  labName: { type: String, trim: true, default: '' },
  labCode: { type: String, trim: true, default: '' }
}, { timestamps: true });

// Compound indexes for fast per-tenant status/queue lookups
labRequestSchema.index({ tenantId: 1, status: 1 });
labRequestSchema.index({ tenantId: 1, patientId: 1 });

module.exports = mongoose.model('LabRequest', labRequestSchema);
