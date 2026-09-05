const mongoose = require('mongoose');

const patientIdentitySchema = new mongoose.Schema({
  uhId: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    match: [/^UH-[A-Z0-9]{8}$/, 'uhId must match format UH-XXXXXXXX with 8 uppercase alphanumeric characters']
  },
  contact: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    default: ''
  },
  abhaId: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('PatientIdentity', patientIdentitySchema);
