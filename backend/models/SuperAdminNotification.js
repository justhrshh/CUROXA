const mongoose = require('mongoose');

const superAdminNotificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['info', 'warning', 'success', 'error'], default: 'info' },
  category: { type: String, enum: ['onboarding', 'support', 'billing', 'system', 'lead', 'dpo'], default: 'system' },
  isRead: { type: Boolean, default: false },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('SuperAdminNotification', superAdminNotificationSchema);
