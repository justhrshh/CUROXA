const mongoose = require('mongoose');

const hospitalExpenseSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, default: 'city_hospital', index: true },
  title: { type: String, required: true },
  category: { 
    type: String, 
    enum: [
      'Procurement & Medical Supplies',
      'Staff & Salaries',
      'Utilities & Electricity',
      'Rent & Facilities',
      'Maintenance & Repairs',
      'Lab & Diagnostics',
      'Marketing & Administrative',
      'Other'
    ], 
    default: 'Other' 
  },
  amount: { type: Number, required: true, min: 0 },
  date: { type: Date, default: Date.now },
  paymentMode: { type: String, enum: ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Other'], default: 'UPI' },
  payee: { type: String, default: '' },
  referenceNumber: { type: String, default: '' },
  notes: { type: String, default: '' },
  recordedBy: { type: String, default: 'Admin' }
}, { timestamps: true });

module.exports = mongoose.model('HospitalExpense', hospitalExpenseSchema);
