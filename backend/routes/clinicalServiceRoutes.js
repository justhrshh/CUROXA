const express = require('express');
const router = express.Router();
const ClinicalService = require('../models/ClinicalService');
const { verifyToken } = require('../middleware/authMiddleware');
const { checkDoctorClinicalMode } = require('../middleware/subscriptionMiddleware');

router.use(verifyToken);
router.use(checkDoctorClinicalMode);

const DEFAULT_CLINICAL_SERVICES = [
  { serviceName: 'Dental — Root Canal Treatment (RCT)', serviceCode: 'DEN-201', department: 'Dental', description: 'Endodontic therapy for infected tooth pulp', price: 3500 },
  { serviceName: 'Dental — Scaling & Polishing', serviceCode: 'DEN-202', department: 'Dental', description: 'Comprehensive ultrasonic plaque & tartar removal', price: 1500 },
  { serviceName: 'Dental — Tooth Extraction (Simple)', serviceCode: 'DEN-203', department: 'Dental', description: 'Painless tooth removal procedure', price: 1200 },
  { serviceName: 'Dental — Ceramic Crown Replacement', serviceCode: 'DEN-204', department: 'Dental', description: 'Permanent tooth capping & fitting', price: 5000 },
  { serviceName: 'Dental — Orthodontic Braces Consultation', serviceCode: 'DEN-205', department: 'Dental', description: 'Alignment & braces assessment', price: 2500 },
  { serviceName: 'Physiotherapy — Posture & Pain Rehab', serviceCode: 'PHY-301', department: 'Physiotherapy', description: '30-min targeted muscle rehabilitation session', price: 800 },
  { serviceName: 'Orthopedic — Splinting & Plaster Application', serviceCode: 'ORT-401', department: 'Orthopedics', description: 'Immobilization for fractures or severe sprains', price: 2000 },
  { serviceName: 'Dermatology — Skin Lesion Excision', serviceCode: 'DER-501', department: 'Dermatology', description: 'Minor outpatient skin procedure', price: 1800 }
];

// Helper to seed default clinical services for a tenant if empty
const seedDefaultsForTenant = async (tenantId) => {
  const count = await ClinicalService.countDocuments({ tenantId });
  if (count === 0) {
    const docs = DEFAULT_CLINICAL_SERVICES.map(service => ({
      ...service,
      tenantId,
      isActive: true
    }));
    await ClinicalService.insertMany(docs);
  }
};

// GET /api/clinical-services - Fetch active clinical services for current hospital tenant
router.get('/', verifyToken, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    await seedDefaultsForTenant(tenantId);
    const services = await ClinicalService.find({ tenantId, isActive: true }).sort({ serviceName: 1 });
    res.json(services);
  } catch (err) {
    console.error('Error fetching clinical services:', err);
    res.status(500).json({ error: 'Failed to fetch clinical services' });
  }
});

// GET /api/clinical-services/all - Fetch all clinical services (active & inactive)
router.get('/all', verifyToken, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    await seedDefaultsForTenant(tenantId);
    const services = await ClinicalService.find({ tenantId }).sort({ createdAt: -1 });
    res.json(services);
  } catch (err) {
    console.error('Error fetching all clinical services:', err);
    res.status(500).json({ error: 'Failed to fetch clinical services' });
  }
});

// POST /api/clinical-services - Add a new clinical service to hospital catalog
router.post('/', verifyToken, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { serviceName, serviceCode, department, description, price, isActive } = req.body;

    if (!serviceName || price === undefined || price === null) {
      return res.status(400).json({ error: 'Service Name and Price are required' });
    }

    const newService = new ClinicalService({
      tenantId,
      serviceName: serviceName.trim(),
      serviceCode: (serviceCode || `SRV-${Date.now().toString().slice(-4)}`).trim(),
      department: (department || 'Dental').trim(),
      description: (description || '').trim(),
      price: Number(price),
      isActive: isActive !== undefined ? isActive : true
    });

    await newService.save();
    res.status(201).json(newService);
  } catch (err) {
    console.error('Error creating clinical service:', err);
    res.status(500).json({ error: 'Failed to create clinical service' });
  }
});

// PUT /api/clinical-services/:id - Update clinical service
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { serviceName, serviceCode, department, description, price, isActive } = req.body;

    const service = await ClinicalService.findOne({ _id: req.params.id, tenantId });
    if (!service) {
      return res.status(404).json({ error: 'Clinical Service not found' });
    }

    if (serviceName) service.serviceName = serviceName.trim();
    if (serviceCode) service.serviceCode = serviceCode.trim();
    if (department) service.department = department.trim();
    if (description !== undefined) service.description = description.trim();
    if (price !== undefined) service.price = Number(price);
    if (isActive !== undefined) service.isActive = isActive;

    await service.save();
    res.json(service);
  } catch (err) {
    console.error('Error updating clinical service:', err);
    res.status(500).json({ error: 'Failed to update clinical service' });
  }
});

// DELETE /api/clinical-services/:id - Delete clinical service
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const service = await ClinicalService.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!service) {
      return res.status(404).json({ error: 'Clinical Service not found' });
    }
    res.json({ message: 'Clinical service deleted successfully' });
  } catch (err) {
    console.error('Error deleting clinical service:', err);
    res.status(500).json({ error: 'Failed to delete clinical service' });
  }
});

// POST /api/clinical-services/seed-default - Reset catalog to default seed
router.post('/seed-default', verifyToken, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    await ClinicalService.deleteMany({ tenantId });
    const docs = DEFAULT_CLINICAL_SERVICES.map(service => ({
      ...service,
      tenantId,
      isActive: true
    }));
    const created = await ClinicalService.insertMany(docs);
    res.json({ message: 'Catalog reset to default seed', services: created });
  } catch (err) {
    console.error('Error seeding clinical services:', err);
    res.status(500).json({ error: 'Failed to seed clinical services' });
  }
});

module.exports = router;
