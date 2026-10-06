const express = require('express');
const router = express.Router();
const HospitalExpense = require('../models/HospitalExpense');
const { verifyToken } = require('../middleware/authMiddleware');

router.use(verifyToken);

// GET /api/expenses - Get all expenses for tenant
router.get('/', async (req, res) => {
  try {
    const expenses = await HospitalExpense.find({ tenantId: req.tenantId }).sort({ date: -1, createdAt: -1 });
    res.json(expenses);
  } catch (err) {
    console.error('Error fetching expenses:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/expenses - Record a new operational expense
router.post('/', async (req, res) => {
  try {
    const { title, category, amount, date, paymentMode, payee, referenceNumber, notes } = req.body;
    if (!title || amount === undefined || amount === null) {
      return res.status(400).json({ error: 'Title and amount are required' });
    }

    const expense = await HospitalExpense.create({
      tenantId: req.tenantId,
      title: title.trim(),
      category: category || 'Other',
      amount: Number(amount) || 0,
      date: date ? new Date(date) : new Date(),
      paymentMode: paymentMode || 'UPI',
      payee: payee ? payee.trim() : '',
      referenceNumber: referenceNumber ? referenceNumber.trim() : '',
      notes: notes ? notes.trim() : '',
      recordedBy: req.user?.name || 'Admin'
    });

    res.status(201).json(expense);
  } catch (err) {
    console.error('Error creating expense:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/expenses/:id - Update an expense
router.put('/:id', async (req, res) => {
  try {
    const expense = await HospitalExpense.findOneAndUpdate(
      { _id: req.params.id, tenantId: req.tenantId },
      req.body,
      { new: true }
    );
    if (!expense) return res.status(404).json({ error: 'Expense not found' });
    res.json(expense);
  } catch (err) {
    console.error('Error updating expense:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/expenses/:id - Delete an expense
router.delete('/:id', async (req, res) => {
  try {
    const result = await HospitalExpense.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId });
    if (!result) return res.status(404).json({ error: 'Expense not found' });
    res.json({ message: 'Expense deleted successfully' });
  } catch (err) {
    console.error('Error deleting expense:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
