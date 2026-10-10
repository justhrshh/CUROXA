const mongoose = require('mongoose');

const paymentEntrySchema = new mongoose.Schema({
  collectionId: { type: String, default: null, index: true }, // Groups entries recorded together in a single multimode collection operation (e.g. PC-...)
  paymentId: { type: String, default: () => `PAY-${Date.now()}-${Math.floor(Math.random() * 1000)}` },
  amount: { type: Number, required: true, min: 0 },
  method: { type: String, enum: ['Cash', 'UPI', 'Card', 'Netbanking', 'Online', 'Online UPI', 'Credit/Debit Card', 'Online (UPI/Card)', 'Other', 'Bank Transfer', 'Cheque', 'Insurance'], required: true },
  source: { type: String, enum: ['Online', 'Counter', 'Reception'], default: 'Counter' },
  transactionRef: { type: String, default: '', trim: true },
  recordedBy: { type: String, default: 'System' },
  recordedByName: { type: String, default: '' },
  recordedAt: { type: Date, default: Date.now },
  notes: { type: String, default: '' },
  requestId: { type: String, default: null, trim: true } // Idempotency key for preventing duplicate submissions
}, { _id: true });

const billingSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, default: 'city_hospital', index: true },
  patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
  appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  items: [{
    description: { type: String, required: true },
    amount: { type: Number, required: true }
  }],
  totalAmount: { type: Number, required: true },
  amountPaid: { type: Number, default: 0 },
  balanceDue: { type: Number, default: 0 },
  status: { type: String, enum: ['Unpaid', 'Partially Paid', 'Paid', 'Pending'], default: 'Unpaid' },
  paymentMethod: { type: String },
  payments: [paymentEntrySchema],
  discountPercent: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  originalAmount: { type: Number },
  discountReason: { type: String, default: '' }
}, { timestamps: true });

// Auto calculate payment totals and status before saving
billingSchema.pre('save', function() {
  if (Array.isArray(this.payments) && this.payments.length > 0) {
    const totalPaid = this.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    this.amountPaid = Math.round(totalPaid * 100) / 100;
    const due = Math.max(0, (Number(this.totalAmount) || 0) - this.amountPaid);
    this.balanceDue = Math.round(due * 100) / 100;
    if (this.amountPaid >= (Number(this.totalAmount) || 0) && (Number(this.totalAmount) || 0) > 0) {
      this.status = 'Paid';
    } else if (this.amountPaid > 0) {
      this.status = 'Partially Paid';
    } else {
      this.status = 'Unpaid';
    }
  } else if (this.status === 'Paid') {
    this.amountPaid = Number(this.totalAmount) || 0;
    this.balanceDue = 0;
  } else {
    this.amountPaid = 0;
    this.balanceDue = Number(this.totalAmount) || 0;
  }
});

module.exports = mongoose.model('Billing', billingSchema);

