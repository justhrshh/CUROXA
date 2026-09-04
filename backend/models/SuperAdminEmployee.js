const mongoose = require('mongoose');

const superAdminEmployeeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  empId: { type: String, unique: true },
  email: { type: String, required: true },
  mobile: { type: String, default: '' },
  department: { type: String, default: 'General' },
  designation: { type: String, default: 'Associate' },
  platformRole: { 
    type: String, 
    enum: ['Onboarding Manager', 'Ticket Manager', 'Finance Manager', 'Request Handler', 'Technical Support', 'Platform Admin'],
    default: 'Onboarding Manager'
  },
  status: { type: String, enum: ['Active', 'On Leave', 'Inactive'], default: 'Active' },
  joiningDate: { type: String, default: '' },
  avatar: { type: String, default: '' }
}, { timestamps: true });

// Auto-generate empId before saving if not present
superAdminEmployeeSchema.pre('save', async function() {
  if (!this.empId) {
    const count = await mongoose.model('SuperAdminEmployee').countDocuments();
    const year = new Date().getFullYear();
    this.empId = `EMP-${year}-${String(count + 1).padStart(3, '0')}`;
  }
  if (!this.avatar) {
    this.avatar = this.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
});

module.exports = mongoose.model('SuperAdminEmployee', superAdminEmployeeSchema);
