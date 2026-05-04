const express = require('express');
const router = express.Router();
const Partner = require('../models/Partner');
const Referral = require('../models/Referral');
const Commission = require('../models/Commission');
const ReferralLink = require('../models/ReferralLink');
const Click = require('../models/Click');
const { protectPartner } = require('../middleware/partnerAuth');

router.use(protectPartner);

router.get('/stats', async (req, res) => {
  try {
    const pid = req.partner._id;
    const [totalReferrals, activeReferrals, totalClicks, commissions, thisMonth, pending] = await Promise.all([
      Referral.countDocuments({ partner: pid }),
      Referral.countDocuments({ partner: pid, status: 'active' }),
      Click.countDocuments({ partner: pid }),
      Commission.aggregate([{ $match: { partner: pid, status: { $in: ['approved', 'paid'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Commission.aggregate([{ $match: { partner: pid, status: { $in: ['approved', 'paid'] }, createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Commission.aggregate([{ $match: { partner: pid, status: 'pending' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);
    const partner = await Partner.findById(pid);
    res.json({ success: true, data: { totalClicks: totalClicks || 0, totalReferrals: totalReferrals || 0, activeReferrals: activeReferrals || 0, totalCommission: commissions[0]?.total || 0, thisMonthCommission: thisMonth[0]?.total || 0, pendingCommission: pending[0]?.total || 0, availableBalance: partner.availableBalance || 0, totalWithdrawn: partner.totalWithdrawn || 0, tier: partner.tier, commissionRate: partner.getCommissionRate() } });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/chart', async (req, res) => {
  try {
    const pid = req.partner._id;
    const data = [];
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
      const end = new Date(new Date().getFullYear(), new Date().getMonth() - i + 1, 0);
      const result = await Commission.aggregate([{ $match: { partner: pid, status: { $in: ['approved', 'paid'] }, createdAt: { $gte: start, $lte: end } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
      data.push({ month: monthNames[start.getMonth()], value: result[0]?.total || 0 });
    }
    res.json({ success: true, data });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/referrals', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const [referrals, total] = await Promise.all([
      Referral.find({ partner: req.partner._id }).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit),
      Referral.countDocuments({ partner: req.partner._id })
    ]);
    res.json({ success: true, data: referrals, pagination: { page, limit, total, pages: Math.ceil(total/limit) } });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/commissions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const [commissions, total] = await Promise.all([
      Commission.find({ partner: req.partner._id }).populate('referral', 'clientName clientEmail').sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit),
      Commission.countDocuments({ partner: req.partner._id })
    ]);
    res.json({ success: true, data: commissions, pagination: { page, limit, total, pages: Math.ceil(total/limit) } });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/links', async (req, res) => {
  try {
    const links = await ReferralLink.find({ partner: req.partner._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: links });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.post('/links', async (req, res) => {
  try {
    const { name, source } = req.body;
    const partner = await Partner.findById(req.partner._id);
    const url = `https://zextooption.com/register?ref=${partner.referralCode}&src=${source || 'direct'}&c=${encodeURIComponent(name || 'default')}`;
    const link = await ReferralLink.create({ partner: req.partner._id, name: name || 'New Campaign', source: source || 'direct', url });
    res.status(201).json({ success: true, data: link });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.delete('/links/:id', async (req, res) => {
  try {
    await ReferralLink.findOneAndDelete({ _id: req.params.id, partner: req.partner._id });
    res.json({ success: true, message: 'Deleted' });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

router.get('/sub-affiliates', async (req, res) => {
  try {
    const subs = await Partner.find({ masterPartner: req.partner._id }).select('name email partnerId tier totalBalance createdAt isActive');
    const enriched = await Promise.all(subs.map(async (sub) => {
      const [refCount, totalComm] = await Promise.all([
        Referral.countDocuments({ partner: sub._id }),
        Commission.aggregate([{ $match: { partner: sub._id, status: { $in: ['approved', 'paid'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
      ]);
      return { _id: sub._id, name: sub.name, partnerId: sub.partnerId, referrals: refCount, totalCommission: totalComm[0]?.total || 0, yourShare: (totalComm[0]?.total || 0) * 0.1, status: sub.isActive ? 'active' : 'inactive', joinDate: sub.createdAt };
    }));
    res.json({ success: true, data: enriched });
  } catch (error) { res.status(500).json({ success: false, message: 'Server error' }); }
});

module.exports = router;