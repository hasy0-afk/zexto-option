const express = require("express");
const bcrypt = require("bcryptjs");
const router = express.Router();
const { Partner, Referral, Commission, Withdrawal, ReferralLink } = require("../models/affiliateModels");
const { generateToken, protectPartner } = require("../middleware/partnerAuth");

// ╔══════════════════════════════════════════╗
// ║         AUTH ROUTES                       ║
// ╚══════════════════════════════════════════╝

// POST /api/affiliate/register
router.post("/register", async (req, res) => {
  try {
    const { name, email, phone, password, masterPartnerId } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email and password are required" });
    }

    // Check if partner already exists
    const existingPartner = await Partner.findOne({ email });
    if (existingPartner) {
      return res.status(400).json({ success: false, message: "Email already registered" });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create partner
    const partner = await Partner.create({
      name,
      email,
      phone: phone || "",
      password: hashedPassword,
      masterPartnerId: masterPartnerId || null,
    });

    // If registered via sub-affiliate link, track it
    if (masterPartnerId) {
      const masterPartner = await Partner.findOne({ partnerId: masterPartnerId });
      if (masterPartner) {
        // Master partner gets notified of new sub-affiliate
        console.log(`New sub-affiliate ${partner.partnerId} registered under ${masterPartnerId}`);
      }
    }

    const token = generateToken(partner._id);

    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      partner: {
        _id: partner._id,
        name: partner.name,
        email: partner.email,
        partnerId: partner.partnerId,
        tier: partner.tier,
        commissionRate: partner.commissionRate,
      },
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /api/affiliate/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    const partner = await Partner.findOne({ email });
    if (!partner) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, partner.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    if (partner.status === "suspended") {
      return res.status(403).json({ success: false, message: "Account is suspended" });
    }

    const token = generateToken(partner._id);

    res.json({
      success: true,
      token,
      partner: {
        _id: partner._id,
        name: partner.name,
        email: partner.email,
        partnerId: partner.partnerId,
        tier: partner.tier,
        commissionRate: partner.commissionRate,
        totalEarned: partner.totalEarned,
        availableBalance: partner.availableBalance,
        totalClicks: partner.totalClicks,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ╔══════════════════════════════════════════╗
// ║         DASHBOARD                         ║
// ╚══════════════════════════════════════════╝

// GET /api/affiliate/dashboard
router.get("/dashboard", protectPartner, async (req, res) => {
  try {
    const partnerId = req.partner._id;

    // Get counts
    const totalReferrals = await Referral.countDocuments({ partnerId });
    const activeReferrals = await Referral.countDocuments({ partnerId, status: "active" });
    const pendingReferrals = await Referral.countDocuments({ partnerId, status: "pending" });

    // Get commission stats
    const totalCommissions = await Commission.aggregate([
      { $match: { partnerId } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Get recent referrals
    const recentReferrals = await Referral.find({ partnerId })
      .sort({ createdAt: -1 })
      .limit(5);

    // Get monthly commission data (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyCommissions = await Commission.aggregate([
      { $match: { partnerId, createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
          total: { $sum: "$amount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Sub-affiliate count
    const subAffiliateCount = await Partner.countDocuments({ masterPartnerId: req.partner.partnerId });

    res.json({
      success: true,
      data: {
        partner: {
          name: req.partner.name,
          email: req.partner.email,
          partnerId: req.partner.partnerId,
          tier: req.partner.tier,
          commissionRate: req.partner.commissionRate,
        },
        stats: {
          totalClicks: req.partner.totalClicks,
          totalReferrals,
          activeReferrals,
          pendingReferrals,
          totalEarned: req.partner.totalEarned,
          availableBalance: req.partner.availableBalance,
          totalWithdrawn: req.partner.totalWithdrawn,
          pendingBalance: req.partner.pendingBalance,
          subAffiliateCount,
        },
        recentReferrals,
        monthlyCommissions,
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ╔══════════════════════════════════════════╗
// ║         REFERRAL LINKS                    ║
// ╚══════════════════════════════════════════╝

// GET /api/affiliate/links
router.get("/links", protectPartner, async (req, res) => {
  try {
    const links = await ReferralLink.find({ partnerId: req.partner._id }).sort({ createdAt: -1 });
    res.json({ success: true, data: links });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /api/affiliate/links
router.post("/links", protectPartner, async (req, res) => {
  try {
    const { campaignName, source } = req.body;

    if (!campaignName) {
      return res.status(400).json({ success: false, message: "Campaign name is required" });
    }

    const srcParam = source && source !== "Direct" ? `&src=${source.toLowerCase()}` : "";
    const url = `http://localhost:5173/register?ref=${req.partner.partnerId}${srcParam}`;

    const link = await ReferralLink.create({
      partnerId: req.partner._id,
      campaignName,
      source: source || "direct",
      url,
    });

    res.status(201).json({ success: true, data: link });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// DELETE /api/affiliate/links/:id
router.delete("/links/:id", protectPartner, async (req, res) => {
  try {
    const link = await ReferralLink.findOneAndDelete({
      _id: req.params.id,
      partnerId: req.partner._id,
    });

    if (!link) {
      return res.status(404).json({ success: false, message: "Link not found" });
    }

    res.json({ success: true, message: "Link deleted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ╔══════════════════════════════════════════╗
// ║         REFERRALS                         ║
// ╚══════════════════════════════════════════╝

// GET /api/affiliate/referrals
router.get("/referrals", protectPartner, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = { partnerId: req.partner._id };
    if (status) query.status = status;

    const referrals = await Referral.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Referral.countDocuments(query);

    res.json({
      success: true,
      data: referrals,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ╔══════════════════════════════════════════╗
// ║         COMMISSIONS                       ║
// ╚══════════════════════════════════════════╝

// GET /api/affiliate/commissions
router.get("/commissions", protectPartner, async (req, res) => {
  try {
    const { status, period, page = 1, limit = 20 } = req.query;
    const query = { partnerId: req.partner._id };

    if (status) query.status = status;

    if (period === "month") {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      query.createdAt = { $gte: startOfMonth };
    } else if (period === "3months") {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      query.createdAt = { $gte: threeMonthsAgo };
    }

    const commissions = await Commission.find(query)
      .populate("referralId", "name email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Commission.countDocuments(query);

    // Stats
    const stats = await Commission.aggregate([
      { $match: { partnerId: req.partner._id } },
      {
        $group: {
          _id: "$status",
          total: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    // This month earnings
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const thisMonth = await Commission.aggregate([
      { $match: { partnerId: req.partner._id, createdAt: { $gte: startOfMonth } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.json({
      success: true,
      data: commissions,
      stats: {
        byStatus: stats,
        thisMonth: thisMonth[0]?.total || 0,
        totalEarned: req.partner.totalEarned,
        totalWithdrawn: req.partner.totalWithdrawn,
        pendingBalance: req.partner.pendingBalance,
      },
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ╔══════════════════════════════════════════╗
// ║         SUB-AFFILIATES                    ║
// ╚══════════════════════════════════════════╝

// GET /api/affiliate/sub-affiliates
router.get("/sub-affiliates", protectPartner, async (req, res) => {
  try {
    const subAffiliates = await Partner.find({ masterPartnerId: req.partner.partnerId })
      .select("name partnerId tier totalEarned status createdAt")
      .sort({ createdAt: -1 });

    // Get referral counts for each sub-affiliate
    const enriched = await Promise.all(
      subAffiliates.map(async (sub) => {
        const referralCount = await Referral.countDocuments({ partnerId: sub._id });
        const subCommission = sub.totalEarned * 0.1; // 10% override
        return {
          _id: sub._id,
          name: sub.name,
          partnerId: sub.partnerId,
          tier: sub.tier,
          referrals: referralCount,
          totalCommission: sub.totalEarned,
          yourShare: Math.round(subCommission * 100) / 100,
          status: sub.status,
          joinDate: sub.createdAt,
        };
      })
    );

    // Total sub-affiliate commission
    const totalSubCommission = enriched.reduce((sum, s) => sum + s.yourShare, 0);

    res.json({
      success: true,
      data: enriched,
      stats: {
        totalSubAffiliates: enriched.length,
        totalSubReferrals: enriched.reduce((sum, s) => sum + s.referrals, 0),
        totalSubCommission: Math.round(totalSubCommission * 100) / 100,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ╔══════════════════════════════════════════╗
// ║         WITHDRAWALS                       ║
// ╚══════════════════════════════════════════╝

// GET /api/affiliate/withdrawals
router.get("/withdrawals", protectPartner, async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ partnerId: req.partner._id }).sort({ createdAt: -1 });

    const pendingAmount = await Withdrawal.aggregate([
      { $match: { partnerId: req.partner._id, status: { $in: ["pending", "processing"] } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.json({
      success: true,
      data: withdrawals,
      stats: {
        availableBalance: req.partner.availableBalance,
        pendingWithdrawal: pendingAmount[0]?.total || 0,
        totalWithdrawn: req.partner.totalWithdrawn,
        minWithdrawal: 50,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /api/affiliate/withdrawals
router.post("/withdrawals", protectPartner, async (req, res) => {
  try {
    const { amount, method, accountDetails } = req.body;

    if (!amount || !method || !accountDetails) {
      return res.status(400).json({ success: false, message: "Amount, method and account details are required" });
    }

    if (amount < 50) {
      return res.status(400).json({ success: false, message: "Minimum withdrawal amount is $50" });
    }

    if (amount > req.partner.availableBalance) {
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }

    // Create withdrawal request
    const withdrawal = await Withdrawal.create({
      partnerId: req.partner._id,
      amount,
      method,
      accountDetails,
    });

    // Deduct from available balance, add to pending
    req.partner.availableBalance -= amount;
    req.partner.pendingBalance += amount;
    await req.partner.save();

    res.status(201).json({ success: true, data: withdrawal, message: "Withdrawal request submitted" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ╔══════════════════════════════════════════╗
// ║         MARKETING MATERIALS               ║
// ╚══════════════════════════════════════════╝

// GET /api/affiliate/marketing
router.get("/marketing", protectPartner, async (req, res) => {
  try {
    // These would typically come from a database or file storage
    const materials = [
      { _id: "1", type: "banner", title: "Banner Set — 728×90, 300×250, 160×600", description: "Standard IAB sizes, dark theme", fileUrl: "/downloads/banners.zip", fileSize: "2.4 MB" },
      { _id: "2", type: "banner", title: "Social Media Kit", description: "Instagram, Facebook, Twitter optimized", fileUrl: "/downloads/social-kit.zip", fileSize: "5.1 MB" },
      { _id: "3", type: "logo", title: "Zexto Option Logo Pack", description: "SVG, PNG — Light & Dark", fileUrl: "/downloads/logos.zip", fileSize: "1.2 MB" },
      { _id: "4", type: "video", title: "Promo Video — 30s", description: "MP4, 1080p platform introduction", fileUrl: "/downloads/promo.mp4", fileSize: "18 MB" },
      { _id: "5", type: "banner", title: "Landing Page Templates", description: "HTML templates for campaigns", fileUrl: "/downloads/landing-pages.zip", fileSize: "3.7 MB" },
      { _id: "6", type: "logo", title: "Email Templates", description: "Pre-built email campaign templates", fileUrl: "/downloads/email-templates.zip", fileSize: "890 KB" },
    ];

    res.json({ success: true, data: materials });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ╔══════════════════════════════════════════╗
// ║         SETTINGS / PROFILE                ║
// ╚══════════════════════════════════════════╝

// GET /api/affiliate/profile
router.get("/profile", protectPartner, async (req, res) => {
  try {
    const partner = await Partner.findById(req.partner._id).select("-password");
    res.json({ success: true, data: partner });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// PUT /api/affiliate/profile
router.put("/profile", protectPartner, async (req, res) => {
  try {
    const { name, email, phone } = req.body;
    const partner = await Partner.findById(req.partner._id);

    if (name) partner.name = name;
    if (email) {
      const existing = await Partner.findOne({ email, _id: { $ne: partner._id } });
      if (existing) return res.status(400).json({ success: false, message: "Email already in use" });
      partner.email = email;
    }
    if (phone !== undefined) partner.phone = phone;

    await partner.save();
    res.json({ success: true, message: "Profile updated", data: { name: partner.name, email: partner.email, phone: partner.phone } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// PUT /api/affiliate/payment-info
router.put("/payment-info", protectPartner, async (req, res) => {
  try {
    const { paymentMethod, paymentAccount, paymentHolderName } = req.body;
    const partner = await Partner.findById(req.partner._id);

    if (paymentMethod) partner.paymentMethod = paymentMethod;
    if (paymentAccount) partner.paymentAccount = paymentAccount;
    if (paymentHolderName) partner.paymentHolderName = paymentHolderName;

    await partner.save();
    res.json({ success: true, message: "Payment info updated" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// PUT /api/affiliate/change-password
router.put("/change-password", protectPartner, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Both passwords are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const partner = await Partner.findById(req.partner._id);
    const isMatch = await bcrypt.compare(currentPassword, partner.password);

    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Current password is incorrect" });
    }

    const salt = await bcrypt.genSalt(10);
    partner.password = await bcrypt.hash(newPassword, salt);
    await partner.save();

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ╔══════════════════════════════════════════╗
// ║   TRACKING (called by main platform)      ║
// ╚══════════════════════════════════════════╝

// POST /api/affiliate/track-click
router.post("/track-click", async (req, res) => {
  try {
    const { ref, src, campaignName } = req.body;

    const partner = await Partner.findOne({ partnerId: ref });
    if (!partner) return res.status(404).json({ success: false, message: "Invalid referral code" });

    // Increment clicks
    partner.totalClicks += 1;
    await partner.save();

    // Update link clicks if exists
    if (src || campaignName) {
      await ReferralLink.findOneAndUpdate(
        { partnerId: partner._id, source: src || "direct" },
        { $inc: { clicks: 1 } }
      );
    }

    res.json({ success: true, partnerId: partner._id });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /api/affiliate/track-signup
router.post("/track-signup", async (req, res) => {
  try {
    const { ref, userName, userEmail, source } = req.body;

    const partner = await Partner.findOne({ partnerId: ref });
    if (!partner) return res.status(404).json({ success: false, message: "Invalid referral code" });

    // Create referral record
    const referral = await Referral.create({
      partnerId: partner._id,
      name: userName || "New User",
      email: userEmail || "",
      source: source || "direct",
      status: "pending",
    });

    // Update link signups
    await ReferralLink.findOneAndUpdate(
      { partnerId: partner._id, source: source || "direct" },
      { $inc: { signups: 1 } }
    );

    res.json({ success: true, referralId: referral._id });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /api/affiliate/track-deposit (called when referred user deposits)
router.post("/track-deposit", async (req, res) => {
  try {
    const { referralId, depositAmount } = req.body;

    const referral = await Referral.findById(referralId);
    if (!referral) return res.status(404).json({ success: false, message: "Referral not found" });

    const partner = await Partner.findById(referral.partnerId);
    if (!partner) return res.status(404).json({ success: false, message: "Partner not found" });

    // Update referral
    referral.totalDeposits += depositAmount;
    referral.status = "active";

    // Calculate commission
    const commissionAmount = (depositAmount * partner.commissionRate) / 100;
    referral.totalCommission += commissionAmount;
    await referral.save();

    // Create commission record
    await Commission.create({
      partnerId: partner._id,
      referralId: referral._id,
      type: "RevShare",
      amount: commissionAmount,
      depositAmount,
      rate: partner.commissionRate,
      status: "paid",
    });

    // Update partner balance
    partner.totalEarned += commissionAmount;
    partner.availableBalance += commissionAmount;
    await partner.save();

    // Update tier
    await partner.updateTier();

    // Handle sub-affiliate commission (10% override)
    if (partner.masterPartnerId) {
      const masterPartner = await Partner.findOne({ partnerId: partner.masterPartnerId });
      if (masterPartner) {
        const subCommission = commissionAmount * 0.1;
        await Commission.create({
          partnerId: masterPartner._id,
          referralId: referral._id,
          type: "SubAffiliate",
          amount: subCommission,
          depositAmount,
          rate: 10,
          status: "paid",
          description: `Override from ${partner.name}`,
        });
        masterPartner.totalEarned += subCommission;
        masterPartner.availableBalance += subCommission;
        await masterPartner.save();
      }
    }

    res.json({ success: true, commission: commissionAmount });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ╔══════════════════════════════════════════╗
// ║   ADMIN ROUTES (for Zexto OS panel)       ║
// ╚══════════════════════════════════════════╝

// GET /api/affiliate/admin/partners - List all partners
router.get("/admin/partners", async (req, res) => {
  try {
    // TODO: Add admin auth middleware
    const partners = await Partner.find()
      .select("-password")
      .sort({ createdAt: -1 });

    const stats = {
      totalPartners: partners.length,
      activePartners: partners.filter((p) => p.status === "active").length,
      totalPaidOut: partners.reduce((sum, p) => sum + p.totalWithdrawn, 0),
      totalPending: partners.reduce((sum, p) => sum + p.pendingBalance, 0),
    };

    res.json({ success: true, data: partners, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// GET /api/affiliate/admin/withdrawals - All withdrawal requests
router.get("/admin/withdrawals", async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status) query.status = status;

    const withdrawals = await Withdrawal.find(query)
      .populate({ path: "partnerId", select: "name email partnerId" })
      .sort({ createdAt: -1 });

    res.json({ success: true, data: withdrawals });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// PUT /api/affiliate/admin/withdrawals/:id - Approve/Reject withdrawal
router.put("/admin/withdrawals/:id", async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;
    const withdrawal = await Withdrawal.findById(req.params.id);

    if (!withdrawal) return res.status(404).json({ success: false, message: "Withdrawal not found" });

    const partner = await Partner.findById(withdrawal.partnerId);

    if (status === "completed") {
      withdrawal.status = "completed";
      withdrawal.processedAt = new Date();
      partner.pendingBalance -= withdrawal.amount;
      partner.totalWithdrawn += withdrawal.amount;
    } else if (status === "rejected") {
      withdrawal.status = "rejected";
      withdrawal.rejectionReason = rejectionReason || "";
      partner.pendingBalance -= withdrawal.amount;
      partner.availableBalance += withdrawal.amount; // refund back
    }

    await withdrawal.save();
    await partner.save();

    res.json({ success: true, message: `Withdrawal ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// PUT /api/affiliate/admin/partners/:id/status - Suspend/Activate partner
router.put("/admin/partners/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    const partner = await Partner.findByIdAndUpdate(req.params.id, { status }, { new: true }).select("-password");

    if (!partner) return res.status(404).json({ success: false, message: "Partner not found" });

    res.json({ success: true, data: partner });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
