const express = require('express');
const router = express.Router();
const PharmacyTicket = require('../models/PharmacyTicket');
const Medicine = require('../models/Medicine');
const { verifyToken, forbidPatientRole } = require('../middleware/authMiddleware');

router.use(verifyToken);
router.use(forbidPatientRole);

// Get all pharmacy tickets (scoped to tenant)
router.get('/', async (req, res) => {
  try {
    const tickets = await PharmacyTicket.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
    res.json(tickets);
  } catch (error) {
    console.error('Error fetching pharmacy tickets:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new pharmacy ticket (scoped to tenant)
router.post('/', async (req, res) => {
  const { alertId, medicineId, medicineName, currentStock, adminComment } = req.body;
  if (!alertId || !medicineId || !medicineName) {
    return res.status(400).json({ error: 'Missing mandatory fields' });
  }
  try {
    const ticket = await PharmacyTicket.create({
      tenantId: req.tenantId,
      alertId,
      medicineId,
      medicineName,
      currentStock: Number(currentStock) || 0,
      adminComment: adminComment || '',
      status: 'Open'
    });
    res.status(201).json(ticket);
  } catch (error) {
    console.error('Error creating pharmacy ticket:', error);
    res.status(500).json({ error: error.message });
  }
});

// Resolve a ticket with reason from Pharmacy (scoped to tenant)
router.put('/:id/resolve', async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Reason for resolution is required' });
  }
  try {
    const ticket = await PharmacyTicket.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    ticket.status = 'Resolved';
    ticket.pharmacyReason = reason;
    ticket.resolvedBy = req.user ? req.user.name : 'Pharmacist';
    ticket.resolvedAt = new Date();

    await ticket.save();
    res.json(ticket);
  } catch (error) {
    console.error('Error resolving pharmacy ticket:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
