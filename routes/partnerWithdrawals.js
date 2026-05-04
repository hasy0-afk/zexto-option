const express = require('express');
const router = express.Router();
const Partner = require('../models/Partner');
const Withdrawal = require('../models/Withdrawal');
const { protectPartner } = require('../middleware/partnerAuth');

router.use(protectPartner);

router.get('/', async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ partner: req.partner._id }).sort({ createdAt: -1 });
    const stats = await Withdrawal.aggregate([{ $match: { partner: req.partner._id } }, { $group: { _id: '$status', total: { $sum: '$amount' } } }]);
    const partner = await Partner.findById(req.partner._id);
    const pending = stats.find(s => s._id === 'pending')?.total || 0;
    const completed = stats.find(s => s._id === 'completed')?.total || 0;
    res.json({ success: true, data: { withdrawals, stats: { availableBalance: partner.availableBalance || 0, pendingWithdrawal: pending, totalWithdrawn: completed, minWithdrawal: 50 } } });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.post('/', async (req, res) => {
  try {
    const { amount, method, accountNumber } = req.body;
    const partner = await Partner.findById(req.partner._id);
    if (!amount || amount < 50) return res.status(400).json({ success: false, message: 'Minimum withdrawal is $50' });
    if (amount > partner.availableBalance) return res.status(400).json({ success: false, message: 'Insufficient balance' });
    if (!method) return res.status(400).json({ success: false, message: 'Payment method required' });
    if (!accountNumber) return res.status(400).json({ success: false, message: 'Account number required' });
    const pendingExists = await Withdrawal.findOne({ partner: req.partner._id, status: 'pending' });
    if (pendingExists) return res.status(400).json({ success: false, message: 'You already have a pending withdrawal' });
    const withdrawal = await Withdrawal.create({ partner: req.partner._id, amount, method, accountNumber });
    partner.availableBalance -= amount;
    await partner.save();
    res.status(201).json({ success: true, data: withdrawal });
  } catch (error) { res.status(500).json({ success: false, message: error.message || 'Server error' }); }
});

module.exports = router;