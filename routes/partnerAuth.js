const express = require('express');
const router = express.Router();
const Partner = require('../models/Partner');
const { generateToken, protectPartner } = require('../middleware/partnerAuth');

router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, masterRef } = req.body;
    const existing = await Partner.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });
    let masterPartner = null;
    if (masterRef) masterPartner = await Partner.findOne({ partnerId: masterRef });
    const partner = await Partner.create({ name, email, phone: phone || '', password, masterPartner: masterPartner ? masterPartner._id : null });
    const token = generateToken(partner._id);
    res.status(201).json({ success: true, data: { _id: partner._id, name: partner.name, email: partner.email, phone: partner.phone, partnerId: partner.partnerId, referralCode: partner.referralCode, tier: partner.tier, totalClicks: 0, availableBalance: 0, totalBalance: 0, totalWithdrawn: 0, paymentMethod: '', accountNumber: '', accountHolderName: '', isVerified: false, createdAt: partner.createdAt }, token });
  } catch (error) { res.status(500).json({ success: false, message: error.message || 'Server error' }); }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: 'Please provide email and password' });
    const partner = await Partner.findOne({ email }).select('+password');
    if (!partner) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const isMatch = await partner.comparePassword(password);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    if (!partner.isActive) return res.status(403).json({ success: false, message: 'Account deactivated' });
    const token = generateToken(partner._id);
    res.json({ success: true, data: { _id: partner._id, name: partner.name, email: partner.email, phone: partner.phone, partnerId: partner.partnerId, referralCode: partner.referralCode, tier: partner.tier, totalClicks: partner.totalClicks, availableBalance: partner.availableBalance, totalBalance: partner.totalBalance, totalWithdrawn: partner.totalWithdrawn, paymentMethod: partner.paymentMethod, accountNumber: partner.accountNumber, accountHolderName: partner.accountHolderName, isVerified: partner.isVerified, createdAt: partner.createdAt }, token });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/me', protectPartner, async (req, res) => {
  try {
    const partner = await Partner.findById(req.partner._id);
    res.json({ success: true, data: { _id: partner._id, name: partner.name, email: partner.email, phone: partner.phone, partnerId: partner.partnerId, referralCode: partner.referralCode, tier: partner.tier, totalClicks: partner.totalClicks, availableBalance: partner.availableBalance, totalBalance: partner.totalBalance, totalWithdrawn: partner.totalWithdrawn, paymentMethod: partner.paymentMethod, accountNumber: partner.accountNumber, accountHolderName: partner.accountHolderName, isVerified: partner.isVerified, createdAt: partner.createdAt } });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.put('/profile', protectPartner, async (req, res) => {
  try {
    const { name, phone, paymentMethod, accountNumber, accountHolderName } = req.body;
    const partner = await Partner.findById(req.partner._id);
    if (name) partner.name = name;
    if (phone !== undefined) partner.phone = phone;
    if (paymentMethod !== undefined) partner.paymentMethod = paymentMethod;
    if (accountNumber !== undefined) partner.accountNumber = accountNumber;
    if (accountHolderName !== undefined) partner.accountHolderName = accountHolderName;
    await partner.save();
    res.json({ success: true, message: 'Profile updated', data: partner });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.put('/password', protectPartner, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const partner = await Partner.findById(req.partner._id).select('+password');
    const isMatch = await partner.comparePassword(currentPassword);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    partner.password = newPassword;
    await partner.save();
    res.json({ success: true, message: 'Password changed' });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

module.exports = router;