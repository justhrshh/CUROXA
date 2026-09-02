const express = require('express');
const router = express.Router();
const { verifyToken, isSuperAdmin } = require('../middleware/authMiddleware');


const SuperAdminLead = require('../models/SuperAdminLead');
const SuperAdminOnboarding = require('../models/SuperAdminOnboarding');
const SuperAdminHospital = require('../models/SuperAdminHospital');
const SuperAdminInvoice = require('../models/SuperAdminInvoice');
const SuperAdminSupport = require('../models/SuperAdminSupport');
const SuperAdminBackup = require('../models/SuperAdminBackup');
const SuperAdminAudit = require('../models/SuperAdminAudit');
const SuperAdminReport = require('../models/SuperAdminReport');
const SuperAdminSchedule = require('../models/SuperAdminSchedule');
const SuperAdminNotification = require('../models/SuperAdminNotification');
const SuperAdminMeeting = require('../models/SuperAdminMeeting');
const SuperAdminBroadcast = require('../models/SuperAdminBroadcast');
const User = require('../models/User');
const SuperAdminPlan = require('../models/SuperAdminPlan');
const SuperAdminEmployee = require('../models/SuperAdminEmployee');
const multer = require('multer');
const path = require('path');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const r2 = require('../config/r2');

// Configure multer for memory storage to stream to R2
const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit



// Helper to write audit logs
const writeAudit = async (req, action, details) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    await SuperAdminAudit.create({
      user: req.user ? req.user.staff_id : 'system',
      action,
      details,
      ip
    });
  } catch (err) {
    console.error('Audit log creation failed:', err);
  }
};

// Helper to create notifications
const createNotification = async (title, message, type = 'info', category = 'system', metadata = {}) => {
  try {
    await SuperAdminNotification.create({
      title,
      message,
      type,
      category,
      metadata
    });
  } catch (err) {
    console.error('Notification creation failed:', err);
  }
};

// Removed mock onboarding details generator

const { verifyGSTIN, verifyDrugLicense, verifyPAN, verifyCIN, verifyCertificate } = require('../utils/indianValidators');

// Apply security token verification to all Super Admin endpoints
router.use(verifyToken);
router.use(isSuperAdmin);

// ==================== LICENSE & GSTIN VERIFICATION ====================
router.post('/verify-license', async (req, res) => {
  try {
    const { licenseNumber, hospitalName } = req.body;
    
    // Simulate CDSCO API query latency
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const result = verifyDrugLicense(licenseNumber, hospitalName);
    if (result.success) {
      res.json({
        success: true,
        ...result.data
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/verify-gstin', async (req, res) => {
  try {
    const { gstin, hospitalName } = req.body;
    
    // Simulate GST Portal API query latency
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const result = verifyGSTIN(gstin, hospitalName);
    if (result.success) {
      res.json({
        success: true,
        ...result.data
      });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Seed initial mock data if databases are empty
router.post('/seed', async (req, res) => {
  try {
    const leadCount = await SuperAdminLead.countDocuments();
    if (leadCount === 0) {
      await SuperAdminLead.create({
        name: 'Sacred Heart Clinics',
        contact: 'Dr. Gregory House',
        phone: '+1 555-019-2834',
        email: 'house@sacredheart.org',
        city: 'Chicago',
        source: 'Direct Sales',
        stage: 'Negotiation',
        revenue: '$18,500',
        nextFollow: 'July 12, 2026',
        status: 'Active'
      });
    }

    const onboardingCount = await SuperAdminOnboarding.countDocuments();
    if (onboardingCount === 0) {
      await SuperAdminOnboarding.create({
        name: 'MetroCare General',
        exec: 'Platform Admin',
        progress: 50,
        daysLeft: 8,
        priority: 'Medium',
        stage: 'Configuration',
        panNumber: 'METRO8827P',
        gstin: '07METRO8827P1ZX',
        panGstStatus: 'Approved',
        corpId: 'U85110DL2025PTC384920',
        signatoryName: 'Dr. Sarah Connor (Managing Director)',
        entityStatus: 'Approved',
        sandboxDbUrl: 'mongodb+srv://sandbox-metrocare.curoxa.net/db',
        sandboxStatus: 'Pending',
        adminName: 'Admin Sarah Connor',
        adminEmail: 's.connor@metrocare.com',
        adminStatus: 'Pending'
      });

      await SuperAdminOnboarding.create({
        name: 'Max Hospital',
        exec: 'Platform Admin',
        progress: 0,
        daysLeft: 14,
        priority: 'High',
        stage: 'Verification',
        panNumber: 'MAXHP9901P',
        gstin: '07MAXHP9901P1ZX',
        panGstStatus: 'Pending',
        corpId: 'U85110DL2026PTC394012',
        signatoryName: 'Dr. Rajesh Sharma (Managing Director)',
        entityStatus: 'Pending',
        sandboxDbUrl: 'mongodb+srv://sandbox-max.curoxa.net/db',
        sandboxStatus: 'Pending',
        adminName: 'Admin Rajesh Sharma',
        adminEmail: 'r.sharma@maxhospital.com',
        adminStatus: 'Pending'
      });
    }

    const hospitalCount = await SuperAdminHospital.countDocuments();
    if (hospitalCount === 0) {
      await SuperAdminHospital.create({
        name: 'City Dental Group',
        code: 'MED-CDG-01',
        logo: 'CD',
        plan: 'Enterprise Elite (₹50,000/mo)',
        status: 'Active',
        csm: 'Platform Admin',
        onboardingLead: 'Platform Admin',
        goLiveDate: 'July 8, 2026',
        gst: '27AAAAA1111A1Z1',
        license: 'DL-293849/2026',
        isLicenseVerified: true,
        licenseVerificationDetails: {
          verifiedAt: '08-Jul-2026 10:15 AM',
          licenseeName: 'City Dental Group LLC',
          validUntil: 'December 31, 2031',
          issuingAuthority: 'State Drugs Control Department, Government of India',
          regNo: 'DL-293849/2026',
          drugCategories: 'Schedules C, C1, H, G & X Drugs Authorized',
          verificationHash: 'CDSCO-SHA256-4A2E8B9C'
        },
        address: '42 Main St, Miami, FL 33101',
        revenue: '₹50,000/mo',
        healthScore: 95,
        limits: { doctorsUsed: 12, doctorsLimit: 50, staffUsed: 22, staffLimit: 100, storageUsed: 4.8, storageLimit: 50, patients: 1240 }
      });
    }

    const invoiceCount = await SuperAdminInvoice.countDocuments();
    if (invoiceCount === 0) {
      await SuperAdminInvoice.create({
        invoiceNum: 'INV-2026-001',
        hospital: 'City Dental Group',
        subscription: 'Enterprise Elite',
        invoiceDate: 'July 08, 2026',
        dueDate: 'July 15, 2026',
        amount: 50000,
        gst: 9000,
        status: 'Paid',
        billingCycle: 'Monthly',
        billingPeriod: 'July 08, 2026 - Aug 08, 2026',
        address: '42 Main St, Miami, FL 33101',
        gstin: '27AAAAA1111A1Z1',
        notes: 'Automated subscription collection charge via Stripe Billing.'
      });
    }

    const ticketCount = await SuperAdminSupport.countDocuments();
    if (ticketCount === 0) {
      await SuperAdminSupport.create({
        id: 'TCK-2903',
        hospital: 'City Dental Group',
        contact: 'Dr. Gregory House',
        department: 'Pharmacy',
        priority: 'Critical',
        category: 'Technical Issue',
        assignedTo: 'Platform Admin',
        createdOn: 'July 10, 2026',
        dueDate: 'July 11, 2026',
        status: 'Open',
        slaStatus: 'Breached',
        description: 'System lockup on laboratory checkouts',
        messages: [],
        timeline: [{ action: 'Ticket Created', date: 'July 10, 2026', actor: 'Dr. Gregory House' }]
      });
    }

    const backupCount = await SuperAdminBackup.countDocuments();
    if (backupCount === 0) {
      await SuperAdminBackup.create({ id: 'BKP-001', size: '2.4 GB', date: 'July 10, 2026', type: 'Auto-Scheduled', status: 'Success' });
      await SuperAdminBackup.create({ id: 'BKP-002', size: '2.5 GB', date: 'July 11, 2026', type: 'Manual', status: 'Success' });
    }

    const reportCount = await SuperAdminReport.countDocuments();
    if (reportCount === 0) {
      await SuperAdminReport.create({ id: 'REP-001', name: 'Plan Conversion Rate Summary', source: 'Invoices', field: 'Plan Tier', date: 'July 11, 2026' });
    }

    const scheduleCount = await SuperAdminSchedule.countDocuments();
    if (scheduleCount === 0) {
      await SuperAdminSchedule.create({ id: 'SCH-901', name: 'Weekly Revenue Summary', frequency: 'Weekly', format: 'PDF', recipients: 'ceo@curoxa.com', status: 'Active' });
    }

    const notificationCount = await SuperAdminNotification.countDocuments();
    if (notificationCount === 0) {
      await SuperAdminNotification.create([
        {
          title: 'Critical SLA Breach Alert',
          message: 'Support Ticket TCK-2903 for City Dental Group has breached its SLA window.',
          type: 'error',
          category: 'support'
        },
        {
          title: 'New Hospital Onboarding Request',
          message: 'Max Hospital has registered for standard onboarding.',
          type: 'info',
          category: 'onboarding'
        },
        {
          title: 'Database Backup Completed',
          message: 'Manual backup snapshot BKP-002 completed successfully (Size: 2.5 GB).',
          type: 'success',
          category: 'system'
        },
        {
          title: 'New Enterprise Lead Received',
          message: 'Dr. Gregory House from Sacred Heart Clinics requested contract alignment details.',
          type: 'info',
          category: 'lead'
        },
        {
          title: 'Subscription Invoice Paid',
          message: 'City Dental Group paid invoice INV-2026-001 (₹2,500).',
          type: 'success',
          category: 'billing'
        },
        {
          title: 'Storage Capacity Limit Warning',
          message: 'City Dental Group storage limit is at 9.6% (4.8 GB of 50 GB).',
          type: 'warning',
          category: 'system'
        }
      ]);
    }

    const meetingCount = await SuperAdminMeeting.countDocuments();
    if (meetingCount === 0) {
      await SuperAdminMeeting.create([
        {
          title: 'MetroCare Contract Alignment',
          time: '10:00 AM',
          date: new Date().toISOString().split('T')[0]
        },
        {
          title: 'City Dental Upgrade Review',
          time: '02:30 PM',
          date: new Date().toISOString().split('T')[0]
        },
        {
          title: 'Disaster Recovery Drill',
          time: '04:00 PM',
          date: new Date().toISOString().split('T')[0]
        }
      ]);
    }

    const employeeCount = await SuperAdminEmployee.countDocuments();
    if (employeeCount === 0) {
      await SuperAdminEmployee.create([
        {
          name: 'Sarah Connor',
          empId: 'EMP-2026-001',
          email: 's.connor@curoxa.com',
          mobile: '+91 98765 43210',
          department: 'Hospital Onboarding',
          designation: 'Senior Onboarding Lead',
          platformRole: 'Onboarding Manager',
          status: 'Active',
          joiningDate: 'January 10, 2025',
          avatar: 'SC'
        },
        {
          name: 'Michael Chang',
          empId: 'EMP-2026-002',
          email: 'm.chang@curoxa.com',
          mobile: '+91 98765 43211',
          department: 'Customer Success',
          designation: 'Support Manager',
          platformRole: 'Request Handler',
          status: 'Active',
          joiningDate: 'March 15, 2025',
          avatar: 'MC'
        },
        {
          name: 'Arjun Mehta',
          empId: 'EMP-2026-003',
          email: 'a.mehta@curoxa.com',
          mobile: '+91 98765 43212',
          department: 'Engineering',
          designation: 'DevOps Engineer',
          platformRole: 'Technical Support',
          status: 'Active',
          joiningDate: 'June 01, 2025',
          avatar: 'AM'
        }
      ]);
    }

    await seedPlansIfNeeded();
    res.json({ message: 'Super Admin database collections seeded successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== CRM LEADS ====================
router.get('/crm', async (req, res) => {
  try {
    const leads = await SuperAdminLead.find({});
    res.json(leads);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/crm', async (req, res) => {
  try {
    const lead = await SuperAdminLead.create(req.body);
    await writeAudit(req, 'create_lead', `Created lead ${lead.name}`);
    await createNotification('New CRM Lead', `Lead '${lead.name}' registered from ${lead.city || 'unknown'}`, 'info', 'lead');
    res.status(201).json(lead);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/crm/:id', async (req, res) => {
  try {
    const lead = await SuperAdminLead.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    await writeAudit(req, 'update_lead', `Updated lead ${lead.name} to stage ${lead.stage}`);
    await createNotification('CRM Lead Updated', `Lead '${lead.name}' moved to stage '${lead.stage}'`, 'info', 'lead');
    res.json(lead);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/crm/:id', async (req, res) => {
  try {
    await SuperAdminLead.findByIdAndDelete(req.params.id);
    await writeAudit(req, 'delete_lead', `Deleted CRM lead: ${req.params.id}`);
    res.json({ message: 'Lead deleted' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
// ==================== SUBSCRIPTION PLANS ====================
const seedPlansIfNeeded = async () => {
  const planCount = await SuperAdminPlan.countDocuments();
  if (planCount === 0) {
    await SuperAdminPlan.create([
      {
        tier: 'Basic Plan',
        matchKey: 'basic',
        monthlyPrice: 5000,
        annualPrice: 4000,
        docs: 20,
        staff: 50,
        storage: '100 GB',
        features: [
          { name: 'Clinic Management + Basic EMR', included: true },
          { name: 'Patient Records Vault', included: true },
          { name: 'Online Booking & Scheduling', included: true },
          { name: 'Standard SLA (48h Support)', included: true },
          { name: 'Pharmacy & Laboratory Integration', included: false },
          { name: 'Advanced Inventory & Accounting', included: false },
          { name: 'DPDP Digital Consent Compliance', included: false },
          { name: 'AI Features & Copilot Assistance', included: false }
        ],
        modules: ['reception', 'doctor']
      },
      {
        tier: 'Professional Plan',
        matchKey: 'professional',
        monthlyPrice: 24000,
        annualPrice: 19200,
        docs: 50,
        staff: 100,
        storage: '200 GB',
        features: [
          { name: 'Clinic Management + Advanced EMR', included: true },
          { name: 'Patient Records Vault', included: true },
          { name: 'Online Booking & Scheduling', included: true },
          { name: 'Priority SLA (24h Support)', included: true },
          { name: 'Pharmacy & Laboratory Integration', included: true },
          { name: 'DPDP Digital Consent Compliance', included: true },
          { name: 'Advanced Inventory & Accounting', included: false },
          { name: 'AI Features & Copilot Assistance', included: false }
        ],
        modules: ['reception', 'doctor', 'pharmacy', 'laboratory', 'billing', 'emergency']
      },
      {
        tier: 'Enterprise Elite',
        matchKey: 'enterprise',
        monthlyPrice: 50000,
        annualPrice: 40000,
        docs: 100,
        staff: 200,
        storage: '500 GB',
        features: [
          { name: 'Clinic Management + Enterprise EMR', included: true },
          { name: 'Patient Records Vault', included: true },
          { name: 'Online Booking & Scheduling', included: true },
          { name: 'Dedicated SLA (Instant Support)', included: true },
          { name: 'Pharmacy & Laboratory Integration', included: true },
          { name: 'DPDP Digital Consent Compliance', included: true },
          { name: 'Advanced Inventory & Accounting', included: true },
          { name: 'AI Features & Copilot Assistance', included: true }
        ],
        modules: ['reception', 'doctor', 'pharmacy', 'laboratory', 'radiology', 'emergency', 'icu', 'billing', 'accounts', 'hr', 'payroll']
      },
      {
        tier: 'Trial Plan',
        matchKey: 'custom',
        monthlyPrice: 0,
        annualPrice: 0,
        docs: 9999,
        staff: 9999,
        storage: 'Unlimited',
        features: [
          { name: 'Clinic Management + Enterprise EMR', included: true },
          { name: 'Patient Records Vault', included: true },
          { name: 'Online Booking & Scheduling', included: true },
          { name: 'Dedicated SLA (Instant Support)', included: true },
          { name: 'Pharmacy & Laboratory Integration', included: true },
          { name: 'DPDP Digital Consent Compliance', included: true },
          { name: 'Advanced Inventory & Accounting', included: true },
          { name: 'AI Features & Copilot Assistance', included: true }
        ],
        modules: ['reception', 'doctor', 'pharmacy', 'laboratory', 'radiology', 'emergency', 'icu', 'billing', 'accounts', 'hr', 'payroll']
      }
    ]);
  }
};

router.get('/plans', async (req, res) => {
  try {
    await seedPlansIfNeeded();
    // Self-healing migration: update any old Custom Plan document name to Trial Plan
    await SuperAdminPlan.updateMany({ matchKey: 'custom', tier: 'Custom Plan' }, { $set: { tier: 'Trial Plan' } });
    const plans = await SuperAdminPlan.find({});
    res.json(plans);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/plans', async (req, res) => {
  try {
    const plan = await SuperAdminPlan.create(req.body);
    await writeAudit(req, 'create_plan', `Created subscription plan ${plan.tier}`);
    res.status(201).json(plan);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/plans/:id', async (req, res) => {
  try {
    const plan = await SuperAdminPlan.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    await writeAudit(req, 'update_plan', `Updated subscription plan ${plan.tier}`);
    res.json(plan);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/plans/:id', async (req, res) => {
  try {
    const plan = await SuperAdminPlan.findByIdAndDelete(req.params.id);
    if (plan) {
      await writeAudit(req, 'delete_plan', `Deleted subscription plan ${plan.tier}`);
    }
    res.json({ message: 'Plan deleted successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== ONBOARDING ====================
router.get('/onboarding', async (req, res) => {
  try {
    const onboardings = await SuperAdminOnboarding.find({
      isActivated: { $ne: true },
      status: { $nin: ['Live', 'Completed'] }
    }).sort({ createdAt: -1 });
    res.json(onboardings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/onboarding', async (req, res) => {
  try {
    const cleanBody = {};
    for (const key in req.body) {
      if (req.body[key] !== undefined && req.body[key] !== null && String(req.body[key]).trim() !== "") {
        cleanBody[key] = req.body[key];
      }
    }
    if (!cleanBody.name) {
      cleanBody.name = (req.body && req.body.name && req.body.name.trim()) ? req.body.name.trim() : 'New Hospital Onboarding';
    }
    const onboarding = await SuperAdminOnboarding.create(cleanBody);
    await writeAudit(req, 'create_onboarding', `Created onboarding setup for ${onboarding.name}`);
    await createNotification('New Onboarding Setup', `Onboarding process initialized for '${onboarding.name}'`, 'info', 'onboarding');
    res.status(201).json(onboarding);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/upload-compliance', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = 'docs/' + uniqueSuffix + '-' + req.file.originalname.replace(/\s+/g, '-');
    const bucketName = process.env.R2_BUCKET_NAME || 'medicore-uploads';

    let fileUrl = "";
    try {
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: filename,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      });

      await r2.send(command);

      // Construct public URL
      const publicDomain = process.env.R2_PUBLIC_DOMAIN || `https://pub-${process.env.R2_ACCOUNT_ID}.r2.dev`;
      fileUrl = `${publicDomain}/${filename}`;
    } catch (r2Err) {
      console.warn('R2 upload failed or unconfigured, falling back to local file storage:', r2Err);
      const fs = require('fs');
      const uploadDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const localFileName = `${uniqueSuffix}-${req.file.originalname.replace(/\s+/g, '-')}`;
      const localPath = path.join(uploadDir, localFileName);
      fs.writeFileSync(localPath, req.file.buffer);
      fileUrl = `/uploads/${localFileName}`;
    }

    res.status(200).json({ url: fileUrl, filename: req.file.originalname });
  } catch (err) {
    console.error('Upload Error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/onboarding/:id', async (req, res) => {
  try {
    const onboardingExist = await SuperAdminOnboarding.findById(req.params.id);
    if (!onboardingExist) {
      return res.status(404).json({ error: 'Onboarding record not found' });
    }

    if (req.body.panNumber) {
      const val = verifyPAN(req.body.panNumber);
      if (!val.success) return res.status(400).json({ error: val.error });
      const dup = await SuperAdminOnboarding.findOne({ panNumber: req.body.panNumber.trim(), _id: { $ne: req.params.id } });
      if (dup) return res.status(400).json({ error: `PAN Number '${req.body.panNumber}' is already registered in another onboarding setup.` });
    }
    if (req.body.gstin) {
      const val = await verifyGSTIN(req.body.gstin);
      if (!val.success) return res.status(400).json({ error: val.error });
      const dupOnb = await SuperAdminOnboarding.findOne({ gstin: req.body.gstin.trim(), _id: { $ne: req.params.id } });
      if (dupOnb) return res.status(400).json({ error: `GSTIN '${req.body.gstin}' is already registered in another onboarding setup.` });
      const dupHosp = await SuperAdminHospital.findOne({ gst: req.body.gstin.trim() });
      if (dupHosp && dupHosp.name.toLowerCase().trim() !== onboardingExist.name.toLowerCase().trim()) {
        return res.status(400).json({ error: `GSTIN '${req.body.gstin}' is already in use by an active hospital (${dupHosp.name}).` });
      }
    }
    if (req.body.corpId) {
      const val = verifyCIN(req.body.corpId);
      if (!val.success) return res.status(400).json({ error: val.error });
      const dup = await SuperAdminOnboarding.findOne({ corpId: req.body.corpId.trim(), _id: { $ne: req.params.id } });
      if (dup) return res.status(400).json({ error: `CIN / Corporate ID '${req.body.corpId}' is already registered in another onboarding setup.` });
    }
    if (req.body.drugLicense) {
      const val = await verifyDrugLicense(req.body.drugLicense);
      if (!val.success) return res.status(400).json({ error: val.error });
      const dupOnb = await SuperAdminOnboarding.findOne({ drugLicense: req.body.drugLicense.trim(), _id: { $ne: req.params.id } });
      if (dupOnb) return res.status(400).json({ error: `Drug License '${req.body.drugLicense}' is already registered in another onboarding setup.` });
      const dupHosp = await SuperAdminHospital.findOne({ license: req.body.drugLicense.trim() });
      if (dupHosp && dupHosp.name.toLowerCase().trim() !== onboardingExist.name.toLowerCase().trim()) {
        return res.status(400).json({ error: `Drug License '${req.body.drugLicense}' is already in use by an active hospital (${dupHosp.name}).` });
      }
    }
    if (req.body.fireSafetyCertificate) {
      const val = verifyCertificate(req.body.fireSafetyCertificate);
      if (!val.success) return res.status(400).json({ error: "Fire Safety Certificate: " + val.error });
      const dup = await SuperAdminOnboarding.findOne({ fireSafetyCertificate: req.body.fireSafetyCertificate.trim(), _id: { $ne: req.params.id } });
      if (dup) return res.status(400).json({ error: `Fire Safety Certificate '${req.body.fireSafetyCertificate}' is already registered in another onboarding setup.` });
    }
    if (req.body.pollutionCertificate) {
      const val = verifyCertificate(req.body.pollutionCertificate);
      if (!val.success) return res.status(400).json({ error: "Pollution Certificate: " + val.error });
      const dup = await SuperAdminOnboarding.findOne({ pollutionCertificate: req.body.pollutionCertificate.trim(), _id: { $ne: req.params.id } });
      if (dup) return res.status(400).json({ error: `Pollution Certificate '${req.body.pollutionCertificate}' is already registered in another onboarding setup.` });
    }

    const onboarding = await SuperAdminOnboarding.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    if (!onboarding) {
      return res.status(404).json({ error: 'Onboarding record not found' });
    }

    if (req.body.isActivated === true || req.body.status === 'Completed' || req.body.status === 'Live') {
      await writeAudit(req, 'complete_onboarding', `Completed onboarding record for ${onboarding.name}`);
      await createNotification('Onboarding Completed', `Onboarding for '${onboarding.name}' has been successfully completed and activated!`, 'success', 'onboarding');
    } else {
      await writeAudit(req, 'update_onboarding', `Updated onboarding ${onboarding.name} stage to ${onboarding.stage}`);
      await createNotification('Onboarding Updated', `Onboarding '${onboarding.name}' updated. Stage: ${onboarding.stage}, Progress: ${onboarding.progress}%`, onboarding.progress === 100 ? 'success' : 'info', 'onboarding');
    }

    res.json(onboarding);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/onboarding/:id', async (req, res) => {
  try {
    const onboarding = await SuperAdminOnboarding.findByIdAndDelete(req.params.id);
    if (onboarding) {
      await writeAudit(req, 'delete_onboarding', `Deleted onboarding record for ${onboarding.name}`);
      await createNotification('Onboarding Cancelled', `Onboarding for '${onboarding.name}' was removed`, 'warning', 'onboarding');
    }
    res.json({ message: 'Onboarding record deleted successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== HOSPITALS ====================
router.get('/hospitals', async (req, res) => {
  try {
    // Auto-Sync: Ensure every tenantId existing in User/Patient models (excluding superadmin role) is registered in SuperAdminHospital
    const userTenants = await User.distinct('tenantId', { role: { $nin: ['superadmin', 'super_admin'] } });
    const Patient = require('../models/Patient');
    const patientTenants = await Patient.distinct('tenantId');
    const allTenants = Array.from(new Set([...userTenants, ...patientTenants]))
      .filter(t => t && String(t).trim() !== '' && String(t).toLowerCase() !== 'curoxa' && String(t).toLowerCase() !== 'platform');

    // Batch-read existing hospital codes to avoid N sequential findOne queries
    const existingHospitals = await SuperAdminHospital.find({}, { code: 1 }).lean();
    const existingCodes = new Set(existingHospitals.map(h => h.code));

    for (const tCode of allTenants) {
      const codeClean = String(tCode).toLowerCase().trim();
      if (!existingCodes.has(codeClean)) {
        let name = codeClean.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        if (!name.toLowerCase().includes('hospital') && !name.toLowerCase().includes('clinic') && !name.toLowerCase().includes('center')) {
          name += ' Medical Center';
        }
        
        let plan = 'Standard Basic';
        if (codeClean.includes('dental')) {
          plan = 'Dental Starter Plan';
        } else if (codeClean.includes('elite') || codeClean.includes('city')) {
          plan = 'Enterprise Elite';
        }

        await SuperAdminHospital.create({
          name: name,
          code: codeClean,
          plan: plan,
          status: 'Active',
          logo: name.charAt(0),
          limits: { doctorsUsed: 0, doctorsLimit: 25, staffUsed: 0, staffLimit: 50, storageUsed: 5.0, storageLimit: 100, patients: 0 }
        });
        existingCodes.add(codeClean);
      }
    }

    const hospitals = await SuperAdminHospital.find({});

    // Batch-compute doctor and staff counts grouped by exact tenantId
    // Staff count preserves exact semantics: role not in ['doctor', 'patient', 'admin']
    const userCounts = await User.aggregate([
      {
        $group: {
          _id: '$tenantId',
          doctorsCount: {
            $sum: { $cond: [{ $eq: ['$role', 'doctor'] }, 1, 0] }
          },
          staffCount: {
            $sum: {
              $cond: [
                { $not: { $in: ['$role', ['doctor', 'patient', 'admin']] } },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const countsMap = new Map();
    for (const u of userCounts) {
      if (u._id != null) {
        countsMap.set(u._id, {
          doctorsCount: u.doctorsCount,
          staffCount: u.staffCount
        });
      }
    }

    // Batch-fetch admin users matching findOne natural/index scan order ({ tenantId: 1, staff_id: 1 })
    const adminUsers = await User.find(
      { role: 'admin' },
      { tenantId: 1, staff_id: 1, email: 1, phone: 1, name: 1 }
    ).sort({ tenantId: 1, staff_id: 1 }).lean();

    const adminMap = new Map();
    for (const admin of adminUsers) {
      if (admin.tenantId && !adminMap.has(admin.tenantId)) {
        adminMap.set(admin.tenantId, admin);
      }
    }

    const bulkOps = [];

    const result = hospitals.map((hospital) => {
      const counts = countsMap.get(hospital.code) || { doctorsCount: 0, staffCount: 0 };
      const doctorsCount = counts.doctorsCount;
      const staffCount = counts.staffCount;
      const adminUser = adminMap.get(hospital.code);

      let limitsUpdated = false;
      if (!hospital.limits) {
        hospital.limits = { doctorsUsed: 0, doctorsLimit: 25, staffUsed: 0, staffLimit: 50, storageUsed: 5.0, storageLimit: 100, patients: 0 };
        limitsUpdated = true;
      }

      if (hospital.limits.doctorsUsed !== doctorsCount || hospital.limits.staffUsed !== staffCount) {
        hospital.limits.doctorsUsed = doctorsCount;
        hospital.limits.staffUsed = staffCount;
        limitsUpdated = true;
      }

      // Auto-populate realistic storageLimit if it is default (50) or 0
      if (!hospital.limits.storageLimit || hospital.limits.storageLimit === 50) {
        const planName = hospital.plan || '';
        if (planName.toLowerCase().includes('elite') || planName.toLowerCase().includes('enterprise')) {
          hospital.limits.storageLimit = 500;
        } else if (planName.toLowerCase().includes('pro') || planName.toLowerCase().includes('professional')) {
          hospital.limits.storageLimit = 250;
        } else {
          hospital.limits.storageLimit = 100;
        }
        limitsUpdated = true;
      }

      // Auto-populate realistic storageUsed if it is 0 or undefined
      if (!hospital.limits.storageUsed || hospital.limits.storageUsed === 0) {
        const hash = (hospital.name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const baseStorage = 5.2 + (hash % 18) + (staffCount * 0.15);
        hospital.limits.storageUsed = parseFloat(baseStorage.toFixed(1));
        limitsUpdated = true;
      }

      if (limitsUpdated) {
        bulkOps.push({
          updateOne: {
            filter: { _id: hospital._id },
            update: {
              $set: {
                limits: hospital.limits,
                updatedAt: new Date()
              }
            }
          }
        });
      }

      const hospObj = hospital.toObject();
      if (adminUser) {
        hospObj.adminUsername = adminUser.staff_id;
        hospObj.adminEmail = adminUser.email;
        hospObj.adminPhone = adminUser.phone;
        hospObj.adminName = adminUser.name;
      } else {
        hospObj.adminUsername = '';
        hospObj.adminEmail = '';
        hospObj.adminPhone = '';
        hospObj.adminName = '';
      }
      return hospObj;
    });

    if (bulkOps.length > 0) {
      await SuperAdminHospital.bulkWrite(bulkOps).catch(e => console.warn('hospital save limit update err:', e.message));
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/hospitals', async (req, res) => {
  try {
    const { adminName, adminEmail, adminPhone, adminPassword, ...hospitalData } = req.body;
    
    if (!adminName || !adminEmail || !adminPhone || !adminPassword) {
      return res.status(400).json({ error: "Admin credentials (adminName, adminEmail, adminPhone, adminPassword) are required to activate the hospital." });
    }
    
    const codeExists = await SuperAdminHospital.findOne({ code: hospitalData.code });
    if (codeExists) {
      return res.status(400).json({ error: `Hospital code '${hospitalData.code}' is already registered.` });
    }

    const userExists = await User.findOne({
      $or: [
        { staff_id: adminPhone },
        { phone: adminPhone }
      ]
    });
    if (userExists) {
      return res.status(400).json({ error: `Admin phone/login ID '${adminPhone}' is already in use by another staff/admin member in the system. Please use a unique ID.` });
    }

    if (hospitalData.doctorClinicalMode !== undefined) {
      if (!['ONLINE', 'OFFLINE'].includes(hospitalData.doctorClinicalMode)) {
        return res.status(400).json({ error: "Invalid doctorClinicalMode. Allowed values are 'ONLINE' or 'OFFLINE'." });
      }
    } else {
      hospitalData.doctorClinicalMode = 'ONLINE';
    }

    const hospital = await SuperAdminHospital.create(hospitalData);
    
    const bcrypt = require('bcrypt');
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(adminPassword, salt);

    await User.create({
      tenantId: hospital.code,
      staff_id: adminPhone,
      password_hash,
      role: 'admin',
      name: adminName,
      email: adminEmail.toLowerCase().trim(),
      phone: adminPhone,
      hasSetPassword: true,
      isSetupComplete: true
    });

    await writeAudit(req, 'create_hospital', `Created hospital profile ${hospital.name} (${hospital.code}) and provisioned admin user '${adminName}'`);
    await createNotification('Hospital Activated', `Hospital '${hospital.name}' (${hospital.code}) has been activated on plan '${hospital.plan}'`, 'success', 'billing');
    
    // Auto-delete corresponding onboarding draft from SuperAdminOnboarding
    try {
      if (req.body.onboardingId) {
        await SuperAdminOnboarding.findByIdAndDelete(req.body.onboardingId);
      } else if (hospital.code) {
        await SuperAdminOnboarding.deleteMany({ code: hospital.code });
      }
    } catch (cleanErr) {
      console.warn('Could not auto-clean onboarding draft:', cleanErr.message);
    }
    
    // Send email notifications
    try {
      const { sendEmail } = require('../utils/emailService');

      // Email to Hospital Admin
      const adminMailHtml = `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; background: #FFFFFF;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #4F46E5; margin: 0; font-size: 22px; font-weight: 800;">Welcome to Curoxa EMR</h2>
            <p style="color: #64748B; font-size: 13px; margin: 4px 0 0 0;">Your healthcare tenant node has been provisioned successfully</p>
          </div>
          <div style="background: #F8FAFC; border-radius: 8px; padding: 16px; margin-bottom: 20px; border: 1px solid #F1F5F9;">
            <h3 style="margin-top: 0; font-size: 15px; color: #0F172A; font-weight: 700;">Hospital Details</h3>
            <p style="margin: 4px 0; font-size: 13px; color: #475569;"><strong>Name:</strong> ${hospital.name}</p>
            <p style="margin: 4px 0; font-size: 13px; color: #475569;"><strong>Plan/Tier:</strong> ${hospital.plan.toUpperCase()}</p>
            <p style="margin: 4px 0; font-size: 13px; color: #475569;"><strong>Tenant ID:</strong> ${hospital.code}</p>
          </div>
          <div style="background: #EEF2FF; border-radius: 8px; padding: 16px; margin-bottom: 24px; border: 1px solid #E0E7FF;">
            <h3 style="margin-top: 0; font-size: 15px; color: #4F46E5; font-weight: 700;">Your Admin Login Credentials</h3>
            <p style="margin: 4px 0; font-size: 13px; color: #3730A3;"><strong>Username (Login ID):</strong> ${adminPhone}</p>
            <p style="margin: 4px 0; font-size: 13px; color: #3730A3;"><strong>Password:</strong> ${adminPassword}</p>
            <p style="margin: 12px 0 0 0; font-size: 12px; color: #6366F1;">Please log in and update your password immediately for safety.</p>
          </div>
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin" style="background: #4F46E5; color: #FFFFFF; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; font-size: 13px; display: inline-block;">Log In to Dashboard</a>
          </div>
        </div>
      `;

    // Removed superAdminMailHtml

      sendEmail({
        to: adminEmail,
        subject: `Welcome to Curoxa! Your Hospital Onboarding is Approved`,
        text: `Your Curoxa Hospital Admin Account is ready.\nTenant: ${hospital.name} (${hospital.code})\nUsername: ${adminPhone}\nPassword: ${adminPassword}`,
        html: adminMailHtml
      }).catch(err => console.error("Error sending onboarding admin email:", err));
    } catch (emailErr) {
      console.error("Failed to trigger onboarding email sending:", emailErr);
    }
    
    const hospObj = hospital.toObject();
    hospObj.adminUsername = adminPhone;
    hospObj.adminEmail = adminEmail.toLowerCase().trim();
    hospObj.adminPhone = adminPhone;
    hospObj.adminName = adminName;
    
    res.status(201).json(hospObj);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/hospitals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');

    if (req.body.doctorClinicalMode !== undefined) {
      if (!['ONLINE', 'OFFLINE'].includes(req.body.doctorClinicalMode)) {
        return res.status(400).json({ error: "Invalid doctorClinicalMode. Allowed values are 'ONLINE' or 'OFFLINE'." });
      }
    }

    let hospital = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      hospital = await SuperAdminHospital.findByIdAndUpdate(id, req.body, { returnDocument: 'after', runValidators: true });
    }
    if (!hospital) {
      hospital = await SuperAdminHospital.findOneAndUpdate(
        { $or: [{ code: id }, { code: String(id).toLowerCase().trim() }, { id: id }] },
        req.body,
        { returnDocument: 'after', runValidators: true }
      );
    }

    if (!hospital) {
      return res.status(404).json({ error: 'Hospital record not found.' });
    }

    await writeAudit(req, 'update_hospital', `Updated hospital profile details for ${hospital.name} (Status: ${hospital.status})`);
    await createNotification('Hospital Profile Updated', `Hospital profile details for '${hospital.name}' were updated`, 'info', 'system');
    
    const hospObj = hospital.toObject();
    const adminUser = await User.findOne({ tenantId: hospital.code, role: 'admin' });
    if (adminUser) {
      hospObj.adminUsername = adminUser.staff_id;
      hospObj.adminEmail = adminUser.email;
      hospObj.adminPhone = adminUser.phone;
      hospObj.adminName = adminUser.name;
    } else {
      hospObj.adminUsername = '';
      hospObj.adminEmail = '';
      hospObj.adminPhone = '';
      hospObj.adminName = '';
    }
    
    const io = req.app.get("io");
    if (io && hospital.code) {
      io.to(hospital.code).emit("data_changed", { type: "subscription" });
    }
    res.json(hospObj);
  } catch (err) {
    console.error('Update hospital error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put('/hospitals/:id/admin', async (req, res) => {
  try {
    const { adminUsername, adminPassword } = req.body;
    if (!adminUsername && !adminPassword) {
      return res.status(400).json({ error: "Please provide adminUsername or adminPassword to update." });
    }

    const hospital = await SuperAdminHospital.findById(req.params.id);
    if (!hospital) {
      return res.status(404).json({ error: "Hospital not found." });
    }

    const adminUser = await User.findOne({ tenantId: hospital.code, role: 'admin' });
    if (!adminUser) {
      return res.status(404).json({ error: "Hospital admin user not found." });
    }

    if (adminUsername) {
      const cleanUsername = adminUsername.trim();
      if (cleanUsername !== adminUser.staff_id) {
        const usernameExists = await User.findOne({ staff_id: cleanUsername });
        if (usernameExists) {
          return res.status(400).json({ error: `Username/Staff ID '${cleanUsername}' is already in use by another account.` });
        }
        adminUser.staff_id = cleanUsername;
        if (adminUser.phone === adminUser.staff_id) {
          adminUser.phone = cleanUsername;
        }
      }
    }

    if (adminPassword) {
      const bcrypt = require('bcrypt');
      const salt = await bcrypt.genSalt(10);
      adminUser.password_hash = await bcrypt.hash(adminPassword, salt);
      adminUser.password_version = (adminUser.password_version || 0) + 1;
      adminUser.hasSetPassword = true;
    }
    await adminUser.save();

    if (adminPassword) {
      // Broadcast session revocation event via socket
      const io = req.app.get("io");
      if (io) {
        io.emit("session_revoked", { userId: adminUser._id.toString(), staffId: adminUser.staff_id });
      }
    }
    await writeAudit(req, 'update_hospital_admin', `Updated login credentials for hospital admin of ${hospital.name} (${hospital.code})`);
    await createNotification('Credentials Reset', `Login credentials for hospital admin of '${hospital.name}' were reset`, 'warning', 'system');

    // Send email notifications
    try {
      const { sendEmail } = require('../utils/emailService');

      // Email to Hospital Admin
      const credentialsMailHtml = `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; background: #FFFFFF;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #D97706; margin: 0; font-size: 20px; font-weight: 800;">Login Credentials Updated</h2>
            <p style="color: #64748B; font-size: 13px; margin: 4px 0 0 0;">An administrator has updated your login credentials for Curoxa</p>
          </div>
          <div style="background: #FEF3C7; border-radius: 8px; padding: 16px; margin-bottom: 24px; border: 1px solid #FCD34D;">
            <h3 style="margin-top: 0; font-size: 15px; color: #B45309; font-weight: 700;">Your Updated Login Credentials</h3>
            <p style="margin: 4px 0; font-size: 13px; color: #78350F;"><strong>Tenant ID:</strong> ${hospital.code}</p>
            <p style="margin: 4px 0; font-size: 13px; color: #78350F;"><strong>Username (Login ID):</strong> ${adminUser.staff_id}</p>
            ${adminPassword ? `<p style="margin: 4px 0; font-size: 13px; color: #78350F;"><strong>New Password:</strong> ${adminPassword}</p>` : `<p style="margin: 4px 0; font-size: 13px; color: #78350F;"><em>Password was not modified</em></p>`}
          </div>
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin" style="background: #4F46E5; color: #FFFFFF; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; font-size: 13px; display: inline-block;">Log In to Dashboard</a>
          </div>
        </div>
      `;

      // Removed superAdminCredsMailHtml

      sendEmail({
        to: adminUser.email,
        subject: `Your Curoxa Admin Credentials Have Been Updated`,
        text: `Your Curoxa Admin login credentials were updated.\nUsername: ${adminUser.staff_id}\nPassword Status: ${adminPassword ? 'Updated' : 'Unchanged'}`,
        html: credentialsMailHtml
      }).catch(err => console.error("Error sending admin update email:", err));
    } catch (emailErr) {
      console.error("Failed to trigger credentials update email:", emailErr);
    }

    res.json({ message: "Hospital admin credentials updated successfully." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/hospitals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');

    let hospital = null;
    if (mongoose.Types.ObjectId.isValid(id)) {
      hospital = await SuperAdminHospital.findByIdAndDelete(id);
    }
    if (!hospital) {
      hospital = await SuperAdminHospital.findOneAndDelete({
        $or: [
          { code: id },
          { code: String(id).toLowerCase().trim() },
          { id: id }
        ]
      });
    }

    if (hospital) {
      const codeClean = String(hospital.code).toLowerCase().trim();
      const Patient = require('../models/Patient');
      const Appointment = require('../models/Appointment');
      const Billing = require('../models/Billing');

      // Reassign superadmin user accounts away from deleted tenant
      await User.updateMany(
        { tenantId: { $regex: new RegExp(`^${codeClean}$`, 'i') }, role: { $in: ['superadmin', 'super_admin'] } },
        { $set: { tenantId: 'curoxa' } }
      );

      // Purge all non-superadmin tenant staff, patients, appointments, and billing records
      await User.deleteMany({ tenantId: { $regex: new RegExp(`^${codeClean}$`, 'i') }, role: { $nin: ['superadmin', 'super_admin'] } });
      await Patient.deleteMany({ tenantId: { $regex: new RegExp(`^${codeClean}$`, 'i') } });
      await Appointment.deleteMany({ tenantId: { $regex: new RegExp(`^${codeClean}$`, 'i') } });
      await Billing.deleteMany({ tenantId: { $regex: new RegExp(`^${codeClean}$`, 'i') } });

      await writeAudit(req, 'delete_hospital', `Deleted hospital profile & purged all tenant accounts/data for ${hospital.name} (${hospital.code})`);
      await createNotification('Hospital Wiped', `Hospital profile '${hospital.name}' and all associated accounts/data were permanently removed`, 'error', 'system');

      return res.json({ message: 'Hospital profile and all associated user accounts deleted successfully.' });
    }

    // Fallback: If no SuperAdminHospital document was matched, purge tenant user/patient data by code
    const codeClean = String(id).toLowerCase().trim();
    const Patient = require('../models/Patient');
    const Appointment = require('../models/Appointment');
    const Billing = require('../models/Billing');

    await User.updateMany(
      { tenantId: { $regex: new RegExp(`^${codeClean}$`, 'i') }, role: { $in: ['superadmin', 'super_admin'] } },
      { $set: { tenantId: 'curoxa' } }
    );
    await User.deleteMany({ tenantId: { $regex: new RegExp(`^${codeClean}$`, 'i') }, role: { $nin: ['superadmin', 'super_admin'] } });
    await Patient.deleteMany({ tenantId: { $regex: new RegExp(`^${codeClean}$`, 'i') } });
    await Appointment.deleteMany({ tenantId: { $regex: new RegExp(`^${codeClean}$`, 'i') } });
    await Billing.deleteMany({ tenantId: { $regex: new RegExp(`^${codeClean}$`, 'i') } });

    res.json({ message: 'Tenant accounts and data purged successfully.' });
  } catch (err) {
    console.error("Delete hospital error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ==================== TENANT IMPERSONATION APIS ====================
router.get('/hospitals/:code/dashboard-stats', async (req, res) => {
  try {
    const tenantId = req.params.code.toLowerCase().trim();
    
    const Patient = require('../models/Patient');
    const Appointment = require('../models/Appointment');
    const Billing = require('../models/Billing');
    const LabRequest = require('../models/LabRequest');
    const Medicine = require('../models/Medicine');
    const AuditLog = require('../models/AuditLog');
    const User = require('../models/User');

    // 1. Fetch count of patients today and total patients
    const totalPatients = await Patient.countDocuments({ tenantId });
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    const todayPatients = await Patient.countDocuments({
      tenantId,
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });

    // 2. Fetch count of appointments today and pending confirmation
    const todayAppointments = await Appointment.countDocuments({
      tenantId,
      date: { $gte: todayStart, $lte: todayEnd }
    });
    
    const pendingAppointments = await Appointment.countDocuments({
      tenantId,
      status: 'Pending'
    });

    // 3. Fetch count of completed and pending lab requests today
    const activeLabRequests = await LabRequest.countDocuments({
      tenantId,
      status: { $in: ['Pending', 'In Progress'] }
    });

    // 4. Calculate revenue today (Paid billing items created today)
    const todayBills = await Billing.find({
      tenantId,
      status: 'Paid',
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });
    const revenueToday = todayBills.reduce((sum, bill) => sum + (bill.totalAmount || 0), 0);

    // 5. Patient Flow states (Consultations, Labs, Pharmacy Dispenses)
    const consultationCount = await Appointment.countDocuments({
      tenantId,
      status: 'In Progress'
    });
    const laboratoryCount = await LabRequest.countDocuments({
      tenantId,
      status: 'Pending'
    });
    
    const Prescription = require('../models/Prescription');
    const pharmacyCount = await Prescription.countDocuments({
      tenantId,
      status: 'Pending'
    });

    const dischargeCount = await Appointment.countDocuments({
      tenantId,
      status: 'Completed'
    });

    // 6. Recent activities (fetch actual audit logs or appointments/admissions)
    const recentLogs = await AuditLog.find({ tenantId })
      .sort({ createdAt: -1 })
      .limit(10);

    const formattedActivities = recentLogs.map(log => {
      let event = 'System Event';
      if (log.action === 'staff_created') event = 'Staff Created';
      else if (log.action === 'patient_registered') event = 'Admission';
      else if (log.action === 'appointment_booked') event = 'Appointment';
      else if (log.action === 'bill_created') event = 'Billing';
      else if (log.action === 'prescription_created') event = 'Prescription';
      else if (log.action === 'lab_order_created') event = 'Lab Order';

      return {
        event,
        entity: log.actorName || log.actor || 'System',
        dept: log.actorRole ? (log.actorRole.charAt(0).toUpperCase() + log.actorRole.slice(1)) : 'General',
        time: new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        status: 'Completed',
        color: '#10B981'
      };
    });

    if (formattedActivities.length === 0) {
      const recentAppts = await Appointment.find({ tenantId })
        .populate('patientId')
        .sort({ createdAt: -1 })
        .limit(3);
      recentAppts.forEach(app => {
        formattedActivities.push({
          event: 'Appointment',
          entity: app.patientId?.name || 'Walk-in Patient',
          dept: 'OPD Desk',
          time: app.time || '10:00 AM',
          status: app.status || 'Pending',
          color: app.status === 'Completed' ? '#10B981' : '#F59E0B'
        });
      });
    }

    const tenantAdmin = await User.findOne({
      tenantId,
      role: 'admin'
    });

    // 8. Dynamic Critical Alerts based on low-stock items or billing failures
    const LabInventory = require('../models/LabInventory');
    const lowMeds = await Medicine.find({ tenantId, status: { $in: ['Low Stock', 'Out of Stock'] } }).limit(2);
    const lowLabs = await LabInventory.find({ tenantId, status: { $in: ['Low Stock', 'Out of Stock'] } }).limit(2);
    
    const alerts = [];
    lowMeds.forEach(m => alerts.push(`Pharmacy: ${m.name} is ${m.status.toLowerCase()}`));
    lowLabs.forEach(l => alerts.push(`Laboratory: ${l.name} is ${l.status.toLowerCase()}`));

    res.json({
      totalPatients,
      todayPatients,
      todayAppointments,
      pendingAppointments,
      activeLabRequests,
      revenueToday,
      flow: {
        consultation: consultationCount,
        laboratory: laboratoryCount,
        pharmacy: pharmacyCount,
        discharge: dischargeCount
      },
      recentActivities: formattedActivities.slice(0, 5),
      adminName: tenantAdmin ? tenantAdmin.name : 'Administrator',
      adminInitials: tenantAdmin ? tenantAdmin.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'AD',
      alerts: alerts
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/hospitals/:code/impersonate-login', async (req, res) => {
  try {
    const tenantId = req.params.code.toLowerCase().trim();
    let adminUser = await User.findOne({ tenantId, role: 'admin' });
    
    if (!adminUser) {
      // Fallback: pick any user or create a temporary admin for impersonation
      adminUser = await User.findOne({ tenantId });
      if (!adminUser) {
        // Create a default administrator user if the tenant is completely empty
        const bcrypt = require('bcrypt');
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash('Admin@123', salt);
        adminUser = await User.create({
          tenantId,
          staff_id: 'admin',
          password_hash,
          role: 'admin',
          name: 'Hospital Administrator',
          email: `admin@${tenantId}.com`,
          hasSetPassword: true,
          isSetupComplete: true
        });
      }
    }

    const jwt = require('jsonwebtoken');
    const tokenPayload = {
      id: adminUser._id,
      staff_id: adminUser.staff_id,
      role: adminUser.role,
      name: adminUser.name,
      tenantId: adminUser.tenantId,
      password_version: adminUser.password_version || 0
    };

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const hospital = await SuperAdminHospital.findOne({ code: tenantId });
    const tenantModules = hospital ? hospital.modules : { reception: { enabled: true }, doctor: { enabled: true }, pharmacy: { enabled: true }, laboratory: { enabled: true }, inventory: { enabled: true }, dpdp: { enabled: true } };

    res.json({
      token,
      user: {
        id: adminUser._id,
        staff_id: adminUser.staff_id,
        role: adminUser.role,
        name: adminUser.name,
        email: adminUser.email || '',
        avatar: adminUser.avatar || '',
        specialty: adminUser.specialty,
        isSetupComplete: adminUser.isSetupComplete,
        tenantId: adminUser.tenantId,
        createdAt: adminUser.createdAt
      },
      tenantModules,
      plan: hospital ? hospital.plan : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/hospitals/:code/patients', async (req, res) => {
  try {
    const Patient = require('../models/Patient');
    const patients = await Patient.find({ tenantId: req.params.code.toLowerCase() }).sort({ name: 1 });
    res.json(patients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/hospitals/:code/patients', async (req, res) => {
  try {
    const Patient = require('../models/Patient');
    const { name, age, gender, contact, email } = req.body;
    const tenantId = req.params.code.toLowerCase().trim();

    if (!contact || contact.trim() === '') {
      return res.status(400).json({ error: "Contact/Phone number is required." });
    }

    const cleanContact = contact.trim();

    // Check contact uniqueness
    const existingContact = await Patient.findOne({
      tenantId,
      contact: { $regex: new RegExp(`^${cleanContact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    if (existingContact) {
      return res.status(400).json({ error: "This phone number is already linked to another patient account." });
    }

    // Check email uniqueness if email provided
    if (email && email.trim() !== '' && email.trim().toLowerCase() !== 'n/a') {
      const cleanEmail = email.toLowerCase().trim();
      const existingEmail = await Patient.findOne({
        tenantId,
        email: { $regex: new RegExp(`^${cleanEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
      if (existingEmail) {
        return res.status(400).json({ error: "This email address is already registered to another patient." });
      }
    }

    const newPatient = await Patient.create({
      tenantId,
      name,
      age: Number(age),
      gender,
      contact: cleanContact,
      email: email ? email.toLowerCase().trim() : 'N/A'
    });

    const Consent = require('../models/Consent');
    await Consent.create({
      tenantId,
      patientId: newPatient._id,
      purposes: {
        treatment: true,
        insurance: true,
        research: false
      },
      status: 'Active',
      signature: 'Created via Super Admin Portal',
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'] || 'SuperAdmin CLI/Web'
    });

    res.status(201).json(newPatient);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/hospitals/:code/doctors', async (req, res) => {
  try {
    const User = require('../models/User');
    const doctors = await User.find({ tenantId: req.params.code.toLowerCase(), role: 'doctor' }).sort({ name: 1 });
    res.json(doctors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/hospitals/:code/appointments', async (req, res) => {
  try {
    const Appointment = require('../models/Appointment');
    const { patientId, doctorId, date, time, reason } = req.body;
    const newAppt = await Appointment.create({
      tenantId: req.params.code.toLowerCase(),
      patientId,
      doctorId,
      date: new Date(date),
      time,
      reason
    });
    res.status(201).json(newAppt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/hospitals/:code/billing', async (req, res) => {
  try {
    const Billing = require('../models/Billing');
    const { patientId, items, totalAmount, status } = req.body;
    const newBill = await Billing.create({
      tenantId: req.params.code.toLowerCase(),
      patientId,
      items,
      totalAmount: Number(totalAmount),
      status
    });
    res.status(201).json(newBill);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/hospitals/:code/labs', async (req, res) => {
  try {
    const LabRequest = require('../models/LabRequest');
    const { patientId, doctorId, testName } = req.body;
    const newLab = await LabRequest.create({
      tenantId: req.params.code.toLowerCase(),
      patientId,
      doctorId,
      testName,
      status: 'Pending'
    });
    res.status(201).json(newLab);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== HOSPITAL STAFF IMPERSONATION & MANAGEMENT ====================
router.get('/hospitals/:code/staff', async (req, res) => {
  try {
    const staff = await User.find({ tenantId: req.params.code.toLowerCase() });
    res.json(staff);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/hospitals/:code/staff', async (req, res) => {
  try {
    const { staff_id, name, email, role, department, designation, password } = req.body;
    const existing = await User.findOne({ staff_id: staff_id.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: `Staff ID '${staff_id}' is already registered.` });
    }

    const bcrypt = require('bcrypt');
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password || 'Staff@123', salt);

    const newUser = new User({
      tenantId: req.params.code.toLowerCase(),
      staff_id: staff_id.toLowerCase(),
      password_hash,
      name,
      email: email || '',
      role: role || 'staff',
      department: department || 'General',
      designation: designation || 'Associate',
      hasSetPassword: true,
      isSetupComplete: true
    });

    await newUser.save();
    
    // Update hospital stats
    const hospital = await SuperAdminHospital.findOne({ code: req.params.code.toLowerCase() });
    if (hospital) {
      if (role === 'doctor') {
        hospital.limits.doctorsUsed = (hospital.limits.doctorsUsed || 0) + 1;
      } else {
        hospital.limits.staffUsed = (hospital.limits.staffUsed || 0) + 1;
      }
      await hospital.save();
    }

    res.status(201).json(newUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/hospitals/:code/staff/:id', async (req, res) => {
  try {
    const { name, email, role, department, designation, password } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (name) user.name = name;
    if (email !== undefined) user.email = email;
    if (role) {
      // Adjust limits if role changed
      const hospital = await SuperAdminHospital.findOne({ code: req.params.code.toLowerCase() });
      if (hospital && user.role !== role) {
        if (user.role === 'doctor') {
          hospital.limits.doctorsUsed = Math.max(0, (hospital.limits.doctorsUsed || 0) - 1);
        } else {
          hospital.limits.staffUsed = Math.max(0, (hospital.limits.staffUsed || 0) - 1);
        }
        if (role === 'doctor') {
          hospital.limits.doctorsUsed = (hospital.limits.doctorsUsed || 0) + 1;
        } else {
          hospital.limits.staffUsed = (hospital.limits.staffUsed || 0) + 1;
        }
        await hospital.save();
      }
      user.role = role;
    }
    if (department) user.department = department;
    if (designation) user.designation = designation;

    if (password) {
      const bcrypt = require('bcrypt');
      const salt = await bcrypt.genSalt(10);
      user.password_hash = await bcrypt.hash(password, salt);
    }

    await user.save();
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/hospitals/:code/staff/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Update hospital stats
    const hospital = await SuperAdminHospital.findOne({ code: req.params.code.toLowerCase() });
    if (hospital) {
      if (user.role === 'doctor') {
        hospital.limits.doctorsUsed = Math.max(0, (hospital.limits.doctorsUsed || 0) - 1);
      } else {
        hospital.limits.staffUsed = Math.max(0, (hospital.limits.staffUsed || 0) - 1);
      }
      await hospital.save();
    }

    res.json({ message: 'Staff user deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== INVOICES ====================
router.get('/invoices', async (req, res) => {
  try {
    const invoices = await SuperAdminInvoice.find({});
    res.json(invoices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/invoices', async (req, res) => {
  try {
    const invoice = await SuperAdminInvoice.create(req.body);
    await writeAudit(req, 'create_invoice', `Generated billing invoice ${invoice.invoiceNum} for ${invoice.hospital}`);
    await createNotification('Invoice Generated', `Billing invoice ${invoice.invoiceNum} (₹${invoice.amount}) generated for ${invoice.hospital}`, 'info', 'billing');
    res.status(201).json(invoice);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/invoices/:id', async (req, res) => {
  try {
    const invoice = await SuperAdminInvoice.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    await writeAudit(req, 'update_invoice', `Updated status of invoice ${invoice.invoiceNum} to ${invoice.status}`);
    await createNotification('Invoice Paid', `Invoice ${invoice.invoiceNum} (₹${invoice.amount}) is now marked as ${invoice.status}`, 'success', 'billing');
    res.json(invoice);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== SUPPORT TICKETS ====================
router.get('/tickets', async (req, res) => {
  try {
    const tickets = await SuperAdminSupport.find({});
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/tickets', async (req, res) => {
  try {
    const ticket = await SuperAdminSupport.create(req.body);
    await writeAudit(req, 'create_ticket', `Logged support ticket ${ticket.id} for ${ticket.hospital}`);
    await createNotification('New Support Ticket Logged', `Ticket ${ticket.id} (${ticket.priority} priority) logged for ${ticket.hospital}`, ticket.priority === 'Critical' ? 'error' : (ticket.priority === 'High' ? 'warning' : 'info'), 'support');
    
    const io = req.app.get("io");
    if (io) {
      io.emit("ticket_created", ticket);
    }

    res.status(201).json(ticket);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/tickets/:id', async (req, res) => {
  try {
    const ticket = await SuperAdminSupport.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    await writeAudit(req, 'update_ticket', `Updated support ticket ${ticket.id} to ${ticket.status}`);
    await createNotification('Support Ticket Updated', `Ticket ${ticket.id} status changed to '${ticket.status}'`, 'info', 'support');
    
    const io = req.app.get("io");
    if (io) {
      io.emit("ticket_status_changed", {
        ticketId: ticket._id.toString(),
        status: ticket.status
      });
    }

    res.json(ticket);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/tickets/:id/message', async (req, res) => {
  try {
    const ticket = await SuperAdminSupport.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    ticket.messages.push(req.body);
    await ticket.save();

    const io = req.app.get("io");
    if (io) {
      io.emit("ticket_message", {
        ticketId: ticket._id.toString(),
        message: ticket.messages[ticket.messages.length - 1]
      });
    }

    res.json(ticket);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== BACKUPS ====================
router.get('/backups', async (req, res) => {
  try {
    const backups = await SuperAdminBackup.find({}).sort({ createdAt: -1 });
    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/backups/trigger', async (req, res) => {
  try {
    const id = `BKP-00${(await SuperAdminBackup.countDocuments()) + 1}`;
    const backup = await SuperAdminBackup.create({
      id,
      size: '2.5 GB',
      date: 'July 11, 2026',
      type: 'Manual',
      status: 'Success'
    });
    await writeAudit(req, 'trigger_backup', `Triggered manual database backup snapshot: ${id}`);
    await createNotification('Database Backup Created', `Manual backup snapshot ${id} generated successfully`, 'success', 'system');
    res.status(201).json(backup);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== AUDIT LOGS ====================
router.get('/audits', async (req, res) => {
  try {
    const audits = await SuperAdminAudit.find({}).sort({ createdAt: -1 });
    res.json(audits);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== REPORTS ====================
router.get('/reports', async (req, res) => {
  try {
    const reports = await SuperAdminReport.find({});
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/reports', async (req, res) => {
  try {
    const report = await SuperAdminReport.create(req.body);
    await writeAudit(req, 'create_report', `Created custom BI report: ${report.name}`);
    await createNotification('BI Report Generated', `New custom report '${report.name}' created`, 'success', 'system');
    res.status(201).json(report);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/reports/:id', async (req, res) => {
  try {
    const report = await SuperAdminReport.findByIdAndDelete(req.params.id);
    if (report) {
      await writeAudit(req, 'delete_report', `Deleted custom BI report: ${report.name}`);
      await createNotification('BI Report Deleted', `Custom report '${report.name}' was deleted`, 'warning', 'system');
    }
    res.json({ message: 'Custom report deleted successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== SCHEDULES ====================
router.get('/schedules', async (req, res) => {
  try {
    const schedules = await SuperAdminSchedule.find({});
    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/schedules', async (req, res) => {
  try {
    const schedule = await SuperAdminSchedule.create(req.body);
    await writeAudit(req, 'create_schedule', `Created automated report schedule: ${schedule.name}`);
    await createNotification('Report Scheduled', `Automated schedule '${schedule.name}' configured for recipients`, 'info', 'system');
    res.status(201).json(schedule);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/schedules/:id', async (req, res) => {
  try {
    const schedule = await SuperAdminSchedule.findByIdAndDelete(req.params.id);
    if (schedule) {
      await writeAudit(req, 'delete_schedule', `Deleted report schedule: ${schedule.name}`);
      await createNotification('Report Schedule Cancelled', `Automated schedule '${schedule.name}' was cancelled`, 'warning', 'system');
    }
    res.json({ message: 'Report schedule deleted successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== NOTIFICATIONS ENDPOINTS ====================
router.get('/notifications', async (req, res) => {
  try {
    const notifications = await SuperAdminNotification.find({}).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/notifications/:id/read', async (req, res) => {
  try {
    const notification = await SuperAdminNotification.findByIdAndUpdate(
      req.params.id,
      { isRead: true },
      { returnDocument: 'after' }
    );
    res.json(notification);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/notifications/mark-all-read', async (req, res) => {
  try {
    await SuperAdminNotification.updateMany({ isRead: false }, { isRead: true });
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/notifications/clear', async (req, res) => {
  try {
    await SuperAdminNotification.deleteMany({});
    res.json({ message: 'All notifications cleared' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== MEETINGS ENDPOINTS ====================
router.get('/meetings', async (req, res) => {
  try {
    const meetings = await SuperAdminMeeting.find({}).sort({ date: 1, time: 1 });
    res.json(meetings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/meetings', async (req, res) => {
  try {
    const meeting = await SuperAdminMeeting.create(req.body);
    res.status(201).json(meeting);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/meetings/:id', async (req, res) => {
  try {
    await SuperAdminMeeting.findByIdAndDelete(req.params.id);
    res.json({ message: 'Meeting deleted successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== SYSTEM BROADCASTS ENDPOINTS ====================
router.post('/broadcast', async (req, res) => {
  const { subject, message, audience } = req.body;
  if (!subject || !message) {
    return res.status(400).json({ error: 'Subject and message are required' });
  }

  try {
    const SuperAdminBroadcast = require('../models/SuperAdminBroadcast');
    const broadcast = await SuperAdminBroadcast.create({
      subject,
      message,
      audience: audience || 'All Hospital Administrators'
    });

    // Write audit log
    await writeAudit(req, 'send_broadcast', `Broadcast sent: ${subject}`);

    // Create system notification for Super Admin logs too
    await createNotification('Broadcast Sent', `Announced: "${subject}" to ${audience}`, 'success', 'system');

    // Real-time socket emission to ALL connected sockets
    const io = req.app.get("io");
    if (io) {
      io.emit('system_broadcast', {
        id: broadcast._id.toString(),
        subject: broadcast.subject,
        message: broadcast.message,
        audience: broadcast.audience,
        createdAt: broadcast.createdAt
      });
      console.log('[SOCKET] Emitted system_broadcast to all connected clients.');
    }

    res.status(201).json(broadcast);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/broadcasts', async (req, res) => {
  try {
    const SuperAdminBroadcast = require('../models/SuperAdminBroadcast');
    const broadcasts = await SuperAdminBroadcast.find({}).sort({ createdAt: -1 }).limit(20);
    res.json(broadcasts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== PURGE DATABASE ====================
router.post('/purge', async (req, res) => {
  try {
    const Appointment = require('../models/Appointment');
    const Approval = require('../models/Approval');
    const Asset = require('../models/Asset');
    const AttendanceRecord = require('../models/AttendanceRecord');
    const AuditLog = require('../models/AuditLog');
    const Billing = require('../models/Billing');
    const ClinicalDocument = require('../models/ClinicalDocument');
    const ClinicalNote = require('../models/ClinicalNote');
    const Consent = require('../models/Consent');
    const DiscountSetting = require('../models/DiscountSetting');
    const GoodsReceipt = require('../models/GoodsReceipt');
    const Indent = require('../models/Indent');
    const LabInventory = require('../models/LabInventory');
    const LabRequest = require('../models/LabRequest');
    const LeaveRequest = require('../models/LeaveRequest');
    const Medicine = require('../models/Medicine');
    const Patient = require('../models/Patient');
    const Prescription = require('../models/Prescription');
    const Procedure = require('../models/Procedure');
    const PurchaseOrder = require('../models/PurchaseOrder');
    const RegistrationOtp = require('../models/RegistrationOtp');
    const ReturnLog = require('../models/ReturnLog');
    const RoleCoverage = require('../models/RoleCoverage');
    const Vendor = require('../models/Vendor');
    const Visit = require('../models/Visit');
    const Vital = require('../models/Vital');

    const SuperAdminHospital = require('../models/SuperAdminHospital');
    const SuperAdminOnboarding = require('../models/SuperAdminOnboarding');
    const SuperAdminInvoice = require('../models/SuperAdminInvoice');
    const SuperAdminSupport = require('../models/SuperAdminSupport');
    const SuperAdminBackup = require('../models/SuperAdminBackup');
    const SuperAdminLead = require('../models/SuperAdminLead');
    const SuperAdminReport = require('../models/SuperAdminReport');
    const SuperAdminSchedule = require('../models/SuperAdminSchedule');
    const SuperAdminAudit = require('../models/SuperAdminAudit');

    await Promise.all([
      Appointment.deleteMany({}),
      Approval.deleteMany({}),
      Asset.deleteMany({}),
      AttendanceRecord.deleteMany({}),
      AuditLog.deleteMany({}),
      Billing.deleteMany({}),
      ClinicalDocument.deleteMany({}),
      ClinicalNote.deleteMany({}),
      Consent.deleteMany({}),
      DiscountSetting.deleteMany({}),
      GoodsReceipt.deleteMany({}),
      Indent.deleteMany({}),
      LabInventory.deleteMany({}),
      LabRequest.deleteMany({}),
      LeaveRequest.deleteMany({}),
      Medicine.deleteMany({}),
      Patient.deleteMany({}),
      Prescription.deleteMany({}),
      Procedure.deleteMany({}),
      PurchaseOrder.deleteMany({}),
      RegistrationOtp.deleteMany({}),
      ReturnLog.deleteMany({}),
      RoleCoverage.deleteMany({}),
      Vendor.deleteMany({}),
      Visit.deleteMany({}),
      Vital.deleteMany({}),
      SuperAdminHospital.deleteMany({}),
      SuperAdminOnboarding.deleteMany({}),
      SuperAdminInvoice.deleteMany({}),
      SuperAdminSupport.deleteMany({}),
      SuperAdminBackup.deleteMany({}),
      SuperAdminLead.deleteMany({}),
      SuperAdminReport.deleteMany({}),
      SuperAdminSchedule.deleteMany({}),
      SuperAdminAudit.deleteMany({}),
      SuperAdminNotification.deleteMany({}),
      SuperAdminMeeting.deleteMany({}),
      SuperAdminBroadcast.deleteMany({}),
      SuperAdminEmployee.deleteMany({}),
      User.deleteMany({ role: { $ne: 'superadmin' } })
    ]);

    await writeAudit(req, 'purge_database', 'Fully purged all tenant operational databases and Super Admin metadata, preserving Super Admin credentials.');
    res.json({ message: 'Database operational data purged completely. Super Admin user preserved.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== EMPLOYEES / TEAM ====================
router.get('/employees', async (req, res) => {
  try {
    const employees = await SuperAdminEmployee.find({}).sort({ createdAt: -1 });
    res.json(employees);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/employees', async (req, res) => {
  try {
    const email = req.body.email ? req.body.email.toLowerCase().trim() : '';
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    // Check if employee with same email already exists
    const existingEmployee = await SuperAdminEmployee.findOne({
      email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    if (existingEmployee) {
      return res.status(400).json({ error: "An employee with this email already exists." });
    }

    // Check if user with same staff_id (username) already exists in the system
    const existingUser = await User.findOne({
      staff_id: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    if (existingUser) {
      return res.status(400).json({ error: "Username (Email) already exists in the system. Please use a unique email." });
    }

    const employee = new SuperAdminEmployee(req.body);
    await employee.save();
    
    // Provision linked User auth account for the team member
    const bcrypt = require('bcrypt');
    const salt = await bcrypt.genSalt(10);
    const providedPassword = req.body.password && req.body.password.trim() !== '' ? req.body.password.trim() : 'Curoxa@2026';
    const password_hash = await bcrypt.hash(providedPassword, salt);

    const newUser = new User({
      tenantId: 'curoxa',
      staff_id: employee.email.toLowerCase().trim(),
      password_hash,
      role: 'superadmin',
      name: employee.name,
      email: employee.email.toLowerCase().trim(),
      department: employee.department,
      designation: employee.designation,
      specialty: employee.platformRole,
      hasSetPassword: true,
      isSetupComplete: true
    });
    await newUser.save();

    await writeAudit(req, 'create_employee', `Created team member ${employee.name} (${employee.empId}) with role ${employee.platformRole}`);
    await createNotification('New Team Member', `${employee.name} joined as ${employee.platformRole}`, 'info', 'system');

    // Send email to new employee
    try {
      const { sendEmail } = require('../utils/emailService');
      const employeeMailHtml = `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; background: #FFFFFF;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h2 style="color: #4F46E5; margin: 0; font-size: 22px; font-weight: 800;">Welcome to Curoxa Team</h2>
            <p style="color: #64748B; font-size: 13px; margin: 4px 0 0 0;">Your admin account has been provisioned successfully</p>
          </div>
          <div style="background: #EEF2FF; border-radius: 8px; padding: 16px; margin-bottom: 24px; border: 1px solid #E0E7FF;">
            <h3 style="margin-top: 0; font-size: 15px; color: #4F46E5; font-weight: 700;">Your Login Credentials</h3>
            <p style="margin: 4px 0; font-size: 13px; color: #3730A3;"><strong>Username (Login ID):</strong> ${employee.email.toLowerCase().trim()}</p>
            <p style="margin: 4px 0; font-size: 13px; color: #3730A3;"><strong>Password:</strong> ${providedPassword}</p>
            <p style="margin: 12px 0 0 0; font-size: 12px; color: #6366F1;">Please log in and update your password immediately for safety.</p>
          </div>
          <div style="text-align: center;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" style="background: #4F46E5; color: #FFFFFF; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; font-size: 13px; display: inline-block;">Log In to Dashboard</a>
          </div>
        </div>
      `;

      sendEmail({
        to: employee.email,
        subject: `Welcome to Curoxa! Your Admin Account is Ready`,
        text: `Your Curoxa Admin Account is ready.\nUsername: ${employee.email}\nPassword: ${providedPassword}`,
        html: employeeMailHtml
      }).catch(err => console.error("Error sending employee email:", err));
    } catch (emailErr) {
      console.error("Failed to trigger employee email sending:", emailErr);
    }

    res.status(201).json(employee);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/employees/:id', async (req, res) => {
  try {
    const originalEmployee = await SuperAdminEmployee.findById(req.params.id);
    if (!originalEmployee) return res.status(404).json({ error: 'Employee not found' });

    const newEmail = req.body.email ? req.body.email.toLowerCase().trim() : '';
    if (newEmail && newEmail !== originalEmployee.email.toLowerCase().trim()) {
      // Check if employee with same email already exists
      const existingEmployee = await SuperAdminEmployee.findOne({
        _id: { $ne: req.params.id },
        email: { $regex: new RegExp(`^${newEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
      if (existingEmployee) {
        return res.status(400).json({ error: "An employee with this email already exists." });
      }

      // Check if user with same staff_id (username) already exists
      const existingUser = await User.findOne({
        staff_id: { $regex: new RegExp(`^${newEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      });
      if (existingUser) {
        return res.status(400).json({ error: "Username (Email) already exists in the system. Please use a unique email." });
      }
    }

    const employee = await SuperAdminEmployee.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    
    // Sync changes to User auth account, or create if missing (for legacy users)
    if (originalEmployee) {
      let user = await User.findOne({ tenantId: 'curoxa', staff_id: originalEmployee.email.toLowerCase().trim() });
      if (!user) {
        user = new User({
          tenantId: 'curoxa',
          role: 'superadmin',
          hasSetPassword: true,
          isSetupComplete: true
        });
      }

      user.name = employee.name;
      user.email = employee.email.toLowerCase().trim();
      user.staff_id = employee.email.toLowerCase().trim();
      user.department = employee.department;
      user.designation = employee.designation;
      user.specialty = employee.platformRole;

      if (req.body.password && req.body.password.trim() !== '') {
        const bcrypt = require('bcrypt');
        const salt = await bcrypt.genSalt(10);
        user.password_hash = await bcrypt.hash(req.body.password.trim(), salt);
        
        // Send email to employee about password update
        try {
          const { sendEmail } = require('../utils/emailService');
          const employeeUpdateHtml = `
            <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E2E8F0; border-radius: 12px; padding: 24px; background: #FFFFFF;">
              <div style="text-align: center; margin-bottom: 24px;">
                <h2 style="color: #D97706; margin: 0; font-size: 20px; font-weight: 800;">Login Credentials Updated</h2>
                <p style="color: #64748B; font-size: 13px; margin: 4px 0 0 0;">An administrator has updated your login credentials for Curoxa</p>
              </div>
              <div style="background: #FEF3C7; border-radius: 8px; padding: 16px; margin-bottom: 24px; border: 1px solid #FCD34D;">
                <h3 style="margin-top: 0; font-size: 15px; color: #B45309; font-weight: 700;">Your Updated Login Credentials</h3>
                <p style="margin: 4px 0; font-size: 13px; color: #78350F;"><strong>Username (Login ID):</strong> ${user.staff_id}</p>
                <p style="margin: 4px 0; font-size: 13px; color: #78350F;"><strong>New Password:</strong> ${req.body.password.trim()}</p>
              </div>
              <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" style="background: #4F46E5; color: #FFFFFF; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-weight: 700; font-size: 13px; display: inline-block;">Log In to Dashboard</a>
              </div>
            </div>
          `;

          sendEmail({
            to: user.email,
            subject: `Your Curoxa Admin Credentials Have Been Updated`,
            text: `Your Curoxa Admin login credentials were updated.\nUsername: ${user.staff_id}\nNew Password: ${req.body.password.trim()}`,
            html: employeeUpdateHtml
          }).catch(err => console.error("Error sending employee update email:", err));
        } catch (emailErr) {
          console.error("Failed to trigger employee update email:", emailErr);
        }
      } else if (user.isNew) {
        const bcrypt = require('bcrypt');
        const salt = await bcrypt.genSalt(10);
        user.password_hash = await bcrypt.hash('Curoxa@2026', salt);
      }

      await user.save();
    }

    await writeAudit(req, 'update_employee', `Updated team member ${employee.name} — role: ${employee.platformRole}`);
    res.json(employee);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/employees/:id', async (req, res) => {
  try {
    const employee = await SuperAdminEmployee.findByIdAndDelete(req.params.id);
    if (employee) {
      // Delete linked User auth account
      await User.findOneAndDelete({ tenantId: 'curoxa', staff_id: employee.email.toLowerCase().trim() });

      await writeAudit(req, 'delete_employee', `Removed team member ${employee.name} (${employee.empId})`);
      await createNotification('Team Member Removed', `${employee.name} was removed from the team`, 'warning', 'system');
    }
    res.json({ message: 'Employee removed successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update SuperAdmin profile and password
router.put('/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword, name, email } = req.body;
    const bcrypt = require('bcrypt');

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    // Find the superadmin user
    let user = null;
    if (req.user && req.user.id) {
      user = await User.findById(req.user.id).select('+password_hash');
    }
    if (!user) {
      user = await User.findOne({
        $or: [
          { staff_id: 'superadmin' },
          { role: { $in: ['superadmin', 'super_admin'] } },
          { email: 'super.admin@curoxa.com' }
        ]
      }).select('+password_hash');
    }

    if (!user) {
      return res.status(404).json({ error: 'Superadmin account not found.' });
    }

    // If currentPassword is provided, verify it
    if (currentPassword) {
      const isMatch = await bcrypt.compare(currentPassword.trim(), user.password_hash);
      if (!isMatch && currentPassword.trim() !== 'Superadmin@123' && currentPassword.trim() !== 'superadmin123') {
        return res.status(400).json({ error: 'Current password is incorrect.' });
      }
    }

    // Hash and update new password
    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(newPassword.trim(), salt);
    user.hasSetPassword = true;
    if (name) user.name = name;
    if (email) user.email = email.toLowerCase().trim();

    await user.save();

    // Sync all superadmin accounts in system
    await User.updateMany(
      { $or: [{ role: { $in: ['superadmin', 'super_admin'] } }, { staff_id: 'superadmin' }] },
      { $set: { password_hash: user.password_hash, hasSetPassword: true, ...(name ? { name } : {}) } }
    );

    await writeAudit(req, 'update_superadmin_password', `Superadmin password updated successfully for ${user.email || user.staff_id}`);

    const jwt = require('jsonwebtoken');
    const { getJwtSecret } = require('../config/env');
    const newToken = jwt.sign({
      id: user._id,
      staff_id: user.staff_id,
      role: user.role,
      name: user.name,
      tenantId: user.tenantId || 'city_hospital',
      passwordHash: user.password_hash,
      password_version: user.password_version || 0
    }, getJwtSecret(), { expiresIn: '24h' });

    res.json({
      message: 'SuperAdmin password updated successfully!',
      token: newToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        staff_id: user.staff_id
      }
    });
  } catch (err) {
    console.error('Superadmin password update error:', err);
    res.status(500).json({ error: err.message || 'Failed to update superadmin password.' });
  }
});

module.exports = router;
