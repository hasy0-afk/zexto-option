const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Partner = require('../models/Partner');
const Referral = require('../models/Referral');
const Commission = require('../models/Commission');
const Withdrawal = require('../models/Withdrawal');
const ReferralLink = require('../models/ReferralLink');
const Click = require('../models/Click');

const JWT_SECRET = process.env.JWT_SECRET || 'zexto-partner-secret-key-change-in-production';

// ─── Helper: Generate Token ───
const generateToken = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: '30d' });

// ─── Middleware: Protect Partner Routes ───
const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, JWT_SECRET);
      req.partner = await Partner.findById(decoded.id).select('-password');
      if (!req.partner) return res.status(401).json({ success: false, message: 'Partner not found' });
      if (!req.partner.isActive) return res.status(403).json({ success: false, message: 'Account deactivated' });
      return next();
    } catch (error) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
  }
  return res.status(401).json({ success: false, message: 'Not authorized, no token' });
};

// Format partner data for response
const formatPartner = (p) => ({
  _id: p._id,
  name: p.name,
  email: p.email,
  phone: p.phone || '',
  partnerId: p.partnerId,
  referralCode: p.referralCode,
  tier: p.tier,
  totalClicks: p.totalClicks || 0,
  availableBalance: p.availableBalance || 0,
  totalBalance: p.totalBalance || 0,
  totalWithdrawn: p.totalWithdrawn || 0,
  paymentMethod: p.paymentMethod || '',
  paymentAccount: p.accountNumber || '',
  paymentHolderName: p.accountHolderName || '',
  isVerified: p.isVerified || false,
  createdAt: p.createdAt,
});

// ══════════════════════════════════════════════
//  PUBLIC ROUTES (no auth)
// ══════════════════════════════════════════════

// POST /api/affiliate/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password, masterPartnerId } = req.body;

    const existing = await Partner.findOne({ email });
    if (existing) return res.status(400).json({ success: false, message: 'Email already registered' });

    let masterPartner = null;
    if (masterPartnerId) {
      masterPartner = await Partner.findOne({ partnerId: masterPartnerId });
    }

    const partner = await Partner.create({
      name,
      email,
      phone: phone || '',
      password,
      masterPartner: masterPartner ? masterPartner._id : null,
    });

    const token = generateToken(partner._id);

    res.status(201).json({
      success: true,
      partner: formatPartner(partner),
      token,
    });
  } catch (error) {
    console.error('Partner register error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// POST /api/affiliate/login
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

    res.json({
      success: true,
      partner: formatPartner(partner),
      token,
    });
  } catch (error) {
    console.error('Partner login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ══════════════════════════════════════════════
//  PROTECTED ROUTES (auth required)
// ══════════════════════════════════════════════

// GET /api/affiliate/profile
router.get('/profile', protect, async (req, res) => {
  try {
    const partner = await Partner.findById(req.partner._id);
    res.json({ success: true, data: formatPartner(partner) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/affiliate/profile
router.put('/profile', protect, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const partner = await Partner.findById(req.partner._id);
    if (name) partner.name = name;
    if (email) partner.email = email;
    if (phone !== undefined) partner.phone = phone;
    await partner.save();
    res.json({ success: true, message: 'Profile updated', data: formatPartner(partner) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/affiliate/payment-info
router.put('/payment-info', protect, async (req, res) => {
  try {
    const { paymentMethod, paymentAccount, paymentHolderName } = req.body;
    const partner = await Partner.findById(req.partner._id);
    if (paymentMethod !== undefined) partner.paymentMethod = paymentMethod;
    if (paymentAccount !== undefined) partner.accountNumber = paymentAccount;
    if (paymentHolderName !== undefined) partner.accountHolderName = paymentHolderName;
    await partner.save();
    res.json({ success: true, message: 'Payment info updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /api/affiliate/change-password
router.put('/change-password', protect, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const partner = await Partner.findById(req.partner._id).select('+password');
    const isMatch = await partner.comparePassword(currentPassword);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    partner.password = newPassword;
    await partner.save();
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/affiliate/dashboard ───
router.get('/dashboard', protect, async (req, res) => {
  try {
    const pid = req.partner._id;

    const [totalReferrals, activeReferrals, totalClicks, commissions, thisMonth, pending, recentReferrals] = await Promise.all([
      Referral.countDocuments({ partner: pid }),
      Referral.countDocuments({ partner: pid, status: 'active' }),
      Click.countDocuments({ partner: pid }),
      Commission.aggregate([{ $match: { partner: pid, status: { $in: ['approved', 'paid'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Commission.aggregate([{
        $match: {
          partner: pid, status: { $in: ['approved', 'paid'] },
          createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
        }
      }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Commission.aggregate([{ $match: { partner: pid, status: 'pending' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Referral.find({ partner: pid }).sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    const partner = await Partner.findById(pid);

    // Monthly commissions for chart (last 6 months)
    const monthlyCommissions = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
      const end = new Date(new Date().getFullYear(), new Date().getMonth() - i + 1, 0, 23, 59, 59);
      const result = await Commission.aggregate([
        { $match: { partner: pid, status: { $in: ['approved', 'paid'] }, createdAt: { $gte: start, $lte: end } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]);
      const y = start.getFullYear();
      const m = String(start.getMonth() + 1).padStart(2, '0');
      monthlyCommissions.push({ _id: `${y}-${m}`, total: result[0]?.total || 0 });
    }

    // Format recent referrals to match frontend expectations
    const formattedReferrals = recentReferrals.map(r => ({
      _id: r._id,
      name: r.clientName,
      email: r.clientEmail,
      status: r.status,
      totalCommission: r.totalCommissionGenerated || 0,
      createdAt: r.createdAt,
    }));

    res.json({
      success: true,
      data: {
        stats: {
          totalClicks: totalClicks || 0,
          totalReferrals: totalReferrals || 0,
          activeReferrals: activeReferrals || 0,
          totalEarned: commissions[0]?.total || 0,
          thisMonth: thisMonth[0]?.total || 0,
          pendingBalance: pending[0]?.total || 0,
          availableBalance: partner.availableBalance || 0,
          totalWithdrawn: partner.totalWithdrawn || 0,
          tier: partner.tier,
          commissionRate: partner.getCommissionRate(),
        },
        recentReferrals: formattedReferrals,
        monthlyCommissions,
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/affiliate/links ───
router.get('/links', protect, async (req, res) => {
  try {
    const links = await ReferralLink.find({ partner: req.partner._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: links });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── POST /api/affiliate/links ───
router.post('/links', protect, async (req, res) => {
  try {
    const { campaignName, source } = req.body;
    const partner = await Partner.findById(req.partner._id);
    const url = `http://localhost:5173/register?ref=${partner.referralCode}&src=${encodeURIComponent(source || 'Direct')}&c=${encodeURIComponent(campaignName || 'default')}`;

    const link = await ReferralLink.create({
      partner: req.partner._id,
      name: campaignName || 'New Campaign',
      campaignName: campaignName || 'New Campaign',
      source: source || 'Direct',
      url,
    });

    res.status(201).json({ success: true, data: link });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── DELETE /api/affiliate/links/:id ───
router.delete('/links/:id', protect, async (req, res) => {
  try {
    await ReferralLink.findOneAndDelete({ _id: req.params.id, partner: req.partner._id });
    res.json({ success: true, message: 'Link deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/affiliate/commissions ───
router.get('/commissions', protect, async (req, res) => {
  try {
    const pid = req.partner._id;
    const partner = await Partner.findById(pid);

    const commissions = await Commission.find({ partner: pid })
      .populate('referral', 'clientName clientEmail')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Format to match frontend expectations
    const formatted = commissions.map(c => ({
      ...c,
      referralId: c.referral ? { name: c.referral.clientName } : null,
    }));

    // Stats
    const [totalEarned, pendingBalance, thisMonth] = await Promise.all([
      Commission.aggregate([{ $match: { partner: pid, status: { $in: ['approved', 'paid'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Commission.aggregate([{ $match: { partner: pid, status: 'pending' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Commission.aggregate([{
        $match: { partner: pid, status: { $in: ['approved', 'paid'] }, createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } }
      }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    ]);

    res.json({
      success: true,
      data: formatted,
      stats: {
        totalEarned: totalEarned[0]?.total || 0,
        pendingBalance: pendingBalance[0]?.total || 0,
        totalWithdrawn: partner.totalWithdrawn || 0,
        thisMonth: thisMonth[0]?.total || 0,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/affiliate/sub-affiliates ───
router.get('/sub-affiliates', protect, async (req, res) => {
  try {
    const subs = await Partner.find({ masterPartner: req.partner._id })
      .select('name email partnerId tier totalBalance createdAt isActive');

    const enriched = await Promise.all(subs.map(async (sub) => {
      const [refCount, totalComm] = await Promise.all([
        Referral.countDocuments({ partner: sub._id }),
        Commission.aggregate([{ $match: { partner: sub._id, status: { $in: ['approved', 'paid'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
      ]);
      const totalCommission = totalComm[0]?.total || 0;
      return {
        _id: sub._id,
        name: sub.name,
        partnerId: sub.partnerId,
        referrals: refCount,
        totalCommission,
        yourShare: Math.round(totalCommission * 0.1),
        status: sub.isActive ? 'active' : 'inactive',
        joinDate: sub.createdAt,
      };
    }));

    // Calculate totals for stats
    const totalSubReferrals = enriched.reduce((a, s) => a + s.referrals, 0);
    const totalSubCommission = enriched.reduce((a, s) => a + s.yourShare, 0);

    res.json({
      success: true,
      data: enriched,
      stats: {
        totalSubAffiliates: enriched.length,
        totalSubReferrals,
        totalSubCommission,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── GET /api/affiliate/withdrawals ───
router.get('/withdrawals', protect, async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ partner: req.partner._id }).sort({ createdAt: -1 });
    const partner = await Partner.findById(req.partner._id);

    const pendingAgg = await Withdrawal.aggregate([
      { $match: { partner: req.partner._id, status: 'pending' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    res.json({
      success: true,
      data: withdrawals,
      stats: {
        availableBalance: partner.availableBalance || 0,
        pendingWithdrawal: pendingAgg[0]?.total || 0,
        totalWithdrawn: partner.totalWithdrawn || 0,
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── POST /api/affiliate/withdrawals ───
router.post('/withdrawals', protect, async (req, res) => {
  try {
    const { amount, method, accountDetails } = req.body;
    const partner = await Partner.findById(req.partner._id);

    if (!amount || amount < 50) return res.status(400).json({ success: false, message: 'Minimum withdrawal is $50' });
    if (amount > partner.availableBalance) return res.status(400).json({ success: false, message: 'Insufficient balance' });
    if (!method) return res.status(400).json({ success: false, message: 'Payment method required' });
    if (!accountDetails) return res.status(400).json({ success: false, message: 'Account details required' });

    const pendingExists = await Withdrawal.findOne({ partner: req.partner._id, status: 'pending' });
    if (pendingExists) return res.status(400).json({ success: false, message: 'You already have a pending withdrawal' });

    const withdrawal = await Withdrawal.create({
      partner: req.partner._id,
      amount,
      method,
      accountNumber: accountDetails,
    });

    partner.availableBalance -= amount;
    await partner.save();

    res.status(201).json({ success: true, data: withdrawal });
  } catch (error) {
    console.error('Withdrawal error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// ─── GET /api/affiliate/marketing ───
router.get('/marketing', protect, async (req, res) => {
  try {
    // Static marketing materials (you can later move to DB)
    const materials = [
      { _id: '1', type: 'banner', title: 'Banner Set — 728×90, 300×250, 160×600', description: 'Standard IAB sizes, dark theme', fileSize: '2.4 MB' },
      { _id: '2', type: 'banner', title: 'Social Media Kit', description: 'Instagram, Facebook, Twitter optimized', fileSize: '5.1 MB' },
      { _id: '3', type: 'logo', title: 'Zexto Option Logo Pack', description: 'SVG, PNG — Light & Dark', fileSize: '1.2 MB' },
      { _id: '4', type: 'video', title: 'Promo Video — 30s', description: 'MP4, 1080p platform introduction', fileSize: '18 MB' },
      { _id: '5', type: 'banner', title: 'Landing Page Templates', description: 'HTML templates for campaigns', fileSize: '3.5 MB' },
      { _id: '6', type: 'logo', title: 'Email Templates', description: 'Pre-built email campaign templates', fileSize: '800 KB' },
    ];
    res.json({ success: true, data: materials });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── POST /api/affiliate/track-click (public) ───
router.post('/track-click', async (req, res) => {
  try {
    const { ref, src, ip, device } = req.body;
    const partner = await Partner.findOne({ referralCode: ref });
    if (!partner) return res.status(404).json({ success: false, message: 'Invalid referral' });

    const link = await ReferralLink.findOne({ partner: partner._id, source: src || 'Direct' });

    await Click.create({
      partner: partner._id,
      referralLink: link?._id || null,
      ip: ip || '',
      source: src || 'direct',
      device: device || '',
    });

    partner.totalClicks += 1;
    await partner.save();

    if (link) { link.clicks += 1; await link.save(); }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─── PROMO CODE ROUTES ───

// We need a PromoCode model — create inline if not exists
const mongoose = require('mongoose');

let PromoCode;
try {
  PromoCode = mongoose.model('PromoCode');
} catch (e) {
  const promoCodeSchema = new mongoose.Schema({
    partner: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    usageCount: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  }, { timestamps: true });
  promoCodeSchema.index({ code: 1 });
  PromoCode = mongoose.model('PromoCode', promoCodeSchema);
}

// POST /api/affiliate/promocode-request
router.post('/promocode-request', protect, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || code.trim().length < 3) return res.status(400).json({ success: false, message: 'Code must be at least 3 characters' });

    const cleanCode = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    
    // Check if code already exists
    const existing = await PromoCode.findOne({ code: cleanCode });
    if (existing) return res.status(400).json({ success: false, message: 'This promo code is already taken' });

    const promo = await PromoCode.create({
      partner: req.partner._id,
      code: cleanCode,
    });

    res.status(201).json({ success: true, data: promo });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// GET /api/affiliate/promocode-requests
router.get('/promocode-requests', protect, async (req, res) => {
  try {
    const requests = await PromoCode.find({ partner: req.partner._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: requests });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
