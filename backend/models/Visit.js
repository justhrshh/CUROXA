const mongoose = require('mongoose');

const visitSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, default: 'city_hospital', index: true },
  visitId: { type: String },
  visitEpisodeId: { type: String },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  uhId: { type: String },
  hospitalPatientId: { type: String },
  doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  appointmentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' }],
  department: { type: String, default: 'OPD' },
  type: { type: String, enum: ['OPD', 'IPD', 'Emergency', 'Teleconsultation', 'Home Visit'], default: 'OPD' },
  arrivalTimestamp: { type: Date, default: Date.now },
  chiefComplaint: { type: String },
  priority: { type: String, enum: ['Red', 'Yellow', 'Green'], default: 'Green' },
  queuePosition: { type: Number },
  status: { type: String, enum: ['Checked-in', 'In Consultation', 'Completed', 'Cancelled'], default: 'Checked-in' }
}, { timestamps: true });

visitSchema.index({ tenantId: 1, visitId: 1 }, { unique: true, sparse: true });
visitSchema.index({ tenantId: 1, visitEpisodeId: 1 });
visitSchema.index({ tenantId: 1, patientId: 1, createdAt: -1 });

module.exports = mongoose.model('Visit', visitSchema);
