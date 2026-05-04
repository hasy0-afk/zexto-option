const mongoose = require("mongoose");
const User = require("../models/User");
const Trade = require("../models/Trade");
const Alert = require("../models/Alert");
const Tournament = require("../models/Tournament");
const Signal = require("../models/Signal");
const Pair = require("../models/Pair");
const KYC = require("../models/KYC");
const CustomTrader = require("../models/CustomTrader");
const Withdrawal = require("../models/Withdrawal");
const { sendKycApprovedEmail, sendWithdrawalProcessingEmail, sendWithdrawalCompletedEmail, sendWithdrawalRejectedEmail } = require("../utils/emailService");

// GET /api/admin/stats — overall stats
exports.getStats = async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalTrades,
      activeTrades,
      totalAlerts,
      totalTournaments,
      liveTournaments,
      totalSignals,
    ] = await Promise.all([
      User.countDocuments(),
      Trade.countDocuments(),
      Trade.countDocuments({ status: "active" }),
      Alert.countDocuments({ triggered: false }),
      Tournament.countDocuments(),
      Tournament.countDocuments({ status: "live" }),
      Signal.countDocuments(),
    ]);

    // Aggregate total P/L from all users
    const pnlAgg = await User.aggregate([
      { $group: { _id: null, total: { $sum: "$stats.totalPnl" } } },
    ]);

    // Aggregate total volume from trades
    const volAgg = await Trade.aggregate([
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    // Deposits/withdrawals (real balance)
    const depositsAgg = await User.aggregate([
      { $group: { _id: null, total: { $sum: "$realBalance" } } },
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        totalTrades,
        activeTrades,
        totalAlerts,
        totalTournaments,
        liveTournaments,
        totalSignals,
        totalPnl: pnlAgg[0]?.total || 0,
        totalVolume: volAgg[0]?.total || 0,
        totalDeposits: depositsAgg[0]?.total || 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/users — all users with full details
exports.getAllUsers = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || "";

    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select("-password")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      users,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/users/:id — single user with trades
exports.getUserDetails = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const [trades, alerts, activeTrades] = await Promise.all([
      Trade.find({ user: user._id }).sort("-createdAt").limit(50),
      Alert.find({ user: user._id, triggered: false }),
      Trade.countDocuments({ user: user._id, status: "active" }),
    ]);

    res.json({
      success: true,
      user,
      trades,
      alerts,
      activeTrades,
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/users/:id
exports.deleteUser = async (req, res, next) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    await Trade.deleteMany({ user: req.params.id });
    await Alert.deleteMany({ user: req.params.id });
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/users/:id/balance — adjust user balance
exports.adjustBalance = async (req, res, next) => {
  try {
    const { demoBalance, realBalance } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    if (typeof demoBalance === "number") user.demoBalance = demoBalance;
    if (typeof realBalance === "number") user.realBalance = realBalance;
    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/trades — all trades across users
exports.getAllTrades = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const status = req.query.status; // optional filter

    const query = status ? { status } : {};
    const total = await Trade.countDocuments(query);
    const trades = await Trade.find(query)
      .populate("user", "name email country")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      trades,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/pairs — pair statistics (merged with DB pairs)
exports.getPairStats = async (req, res, next) => {
  try {
    
    // Get all pairs from DB (including disabled)
    const dbPairs = await Pair.find({}).sort("sortOrder symbol");

    // Aggregate trade stats per symbol
    const pairStats = await Trade.aggregate([
      {
        $group: {
          _id: "$symbol",
          pair: { $first: "$pair" },
          totalTrades: { $sum: 1 },
          totalVolume: { $sum: "$amount" },
          wins: {
            $sum: { $cond: [{ $eq: ["$status", "won"] }, 1, 0] },
          },
          losses: {
            $sum: { $cond: [{ $eq: ["$status", "lost"] }, 1, 0] },
          },
          activeTrades: {
            $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
          },
        },
      },
    ]);

    const enriched = dbPairs.map((p) => {
      const stat = pairStats.find((s) => s._id === p.symbol) || {};
      return {
        _id: p._id,
        symbol: p.symbol,
        label: p.label,
        short: p.short,
        pair: p.pair,
        payout: p.payout,
        precision: p.precision,
        logo: p.logo,
        category: p.category,
        enabled: p.enabled,
        sortOrder: p.sortOrder,
        minAmount: p.minAmount,
        maxAmount: p.maxAmount,
        otc: p.otc || false,
        basePrice: p.basePrice || 0,
        volatility: p.volatility || 0.0001,
        flag: p.flag || '',
        priceOffset: p.priceOffset || 0,
        trendBias: p.trendBias || 0,
        totalTrades: stat.totalTrades || 0,
        totalVolume: stat.totalVolume || 0,
        wins: stat.wins || 0,
        losses: stat.losses || 0,
        activeTrades: stat.activeTrades || 0,
        winRate:
          (stat.wins || 0) + (stat.losses || 0) > 0
            ? ((stat.wins / (stat.wins + stat.losses)) * 100).toFixed(1)
            : "0.0",
      };
    });

    res.json({ success: true, pairs: enriched });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/pairs — create new pair
exports.createPair = async (req, res, next) => {
  try {
    const { symbol, label, short, pair, payout, precision, logo, category, enabled, sortOrder, minAmount, maxAmount } = req.body;
    if (!symbol || !label || !short || !pair) {
      return res.status(400).json({ success: false, message: "symbol, label, short, pair are required" });
    }
    const existing = await Pair.findOne({ symbol: symbol.toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: "Pair with this symbol already exists" });
    }
    const p = await Pair.create({
      symbol: symbol.toUpperCase(),
      label,
      short: short.toUpperCase(),
      pair,
      payout: payout ?? 80,
      precision: precision ?? 2,
      logo: logo || "",
      category: category || "crypto",
      enabled: enabled !== false,
      sortOrder: sortOrder || 0,
      minAmount: minAmount || 1,
      maxAmount: maxAmount || 10000,
    });
    res.status(201).json({ success: true, pair: p });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/pairs/:id — update pair
exports.updatePair = async (req, res, next) => {
  try {
    const updates = req.body;
    // Don't allow changing _id
    delete updates._id;
    if (updates.symbol) updates.symbol = updates.symbol.toUpperCase();
    if (updates.short) updates.short = updates.short.toUpperCase();
    const p = await Pair.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!p) return res.status(404).json({ success: false, message: "Pair not found" });
    res.json({ success: true, pair: p });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/pairs/:id — delete pair
exports.deletePair = async (req, res, next) => {
  try {
    const p = await Pair.findByIdAndDelete(req.params.id);
    if (!p) return res.status(404).json({ success: false, message: "Pair not found" });
    res.json({ success: true, message: "Pair deleted" });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/pairs/:id/toggle — toggle enabled/disabled
exports.togglePair = async (req, res, next) => {
  try {
    const p = await Pair.findById(req.params.id);
    if (!p) return res.status(404).json({ success: false, message: "Pair not found" });
    p.enabled = !p.enabled;
    await p.save();
    res.json({ success: true, pair: p });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/deposits — users with real balance (deposits)
exports.getDeposits = async (req, res, next) => {
  try {
    const users = await User.find({ realBalance: { $gt: 0 } })
      .select("name email country realBalance createdAt")
      .sort("-realBalance");

    // For now, deposits come from realBalance field
    // In a real app, you'd have a separate Deposits collection
    const deposits = users.map((u) => ({
      _id: u._id,
      user: { name: u.name, email: u.email, country: u.country },
      amount: u.realBalance,
      status: "completed",
      method: "manual",
      date: u.createdAt,
    }));

    res.json({ success: true, deposits, total: deposits.length });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/deposits/:userId — add deposit for user
exports.addDeposit = async (req, res, next) => {
  try {
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ success: false, message: "Valid amount required" });
    }
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    user.realBalance += +amount;
    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/withdrawals — all user withdrawals
exports.getWithdrawals = async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status && status !== "all") query.status = status;
    const withdrawals = await Withdrawal.find(query)
      .sort({ createdAt: -1 })
      .limit(200);
    const total = await Withdrawal.countDocuments(query);
    const pending = await Withdrawal.countDocuments({ status: "pending" });
    const processing = await Withdrawal.countDocuments({ status: "processing" });
    const completed = await Withdrawal.countDocuments({ status: "completed" });
    const rejected = await Withdrawal.countDocuments({ status: "rejected" });
    res.json({
      success: true,
      withdrawals,
      total,
      counts: { pending, processing, completed, rejected },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/withdrawals/:userId — process withdrawal for user
exports.processWithdrawal = async (req, res, next) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    if (user.realBalance < amount) {
      return res
        .status(400)
        .json({ success: false, message: "Insufficient balance" });
    }
    user.realBalance -= +amount;
    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/kyc — REAL KYC submissions only
exports.getKYC = async (req, res, next) => {
  try {
    const submissions = await KYC.find({})
      .populate("user", "name email country")
      .sort("-submittedAt");
    res.json({ success: true, kyc: submissions, total: submissions.length });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/kyc/:id — approve/reject KYC
exports.updateKYC = async (req, res, next) => {
  try {
    const { status, rejectionReason } = req.body;
    if (!["approved", "rejected", "pending"].includes(status)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid status" });
    }
    const kyc = await KYC.findById(req.params.id);
    if (!kyc) {
      return res.status(404).json({ success: false, message: "KYC record not found" });
    }
    kyc.status = status;
    if (status === "rejected" && rejectionReason) {
      kyc.rejectionReason = rejectionReason;
    }
    kyc.reviewedAt = new Date();
    kyc.reviewedBy = "admin";
    await kyc.save();

    // Send KYC approved email
    if (status === "approved") {
      const user = await User.findById(kyc.user);
      if (user) sendKycApprovedEmail(user.email, user.name).catch(() => {});
    }

    res.json({ success: true, message: `KYC ${status}`, kyc });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/kyc/:id
exports.deleteKYC = async (req, res, next) => {
  try {
    await KYC.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "KYC record deleted" });
  } catch (err) {
    next(err);
  }
};

// ============== TOURNAMENTS ==============

// GET /api/admin/tournaments — all tournaments including ended
exports.getAllTournaments = async (req, res, next) => {
  try {
    const tournaments = await Tournament.find({}).sort("-startsAt");
    res.json({ success: true, tournaments, total: tournaments.length });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/tournaments — create tournament
exports.createTournament = async (req, res, next) => {
  try {
    const { title, description, icon, prize, entryFee, maxParticipants, startsAt, endsAt } = req.body;
    if (!title || !prize || !startsAt || !endsAt) {
      return res.status(400).json({
        success: false,
        message: "title, prize, startsAt, endsAt are required",
      });
    }
    const t = await Tournament.create({
      title,
      description: description || "",
      icon: icon || "🏆",
      prize: +prize,
      entryFee: +entryFee || 0,
      maxParticipants: +maxParticipants || 1000,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
    });
    res.status(201).json({ success: true, tournament: t });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/tournaments/:id — update tournament
exports.updateTournament = async (req, res, next) => {
  try {
    const updates = req.body;
    delete updates._id;
    delete updates.participants;  // managed separately
    if (updates.startsAt) updates.startsAt = new Date(updates.startsAt);
    if (updates.endsAt) updates.endsAt = new Date(updates.endsAt);
    const t = await Tournament.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!t) return res.status(404).json({ success: false, message: "Tournament not found" });
    res.json({ success: true, tournament: t });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/tournaments/:id
exports.deleteTournament = async (req, res, next) => {
  try {
    await Tournament.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Tournament deleted" });
  } catch (err) {
    next(err);
  }
};

// ============== CUSTOM TRADERS (RANKING) ==============

// GET /api/admin/custom-traders
exports.getCustomTraders = async (req, res, next) => {
  try {
    const traders = await CustomTrader.find({}).sort("-pnl");
    res.json({ success: true, traders });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/custom-traders — add fake trader to leaderboard
exports.createCustomTrader = async (req, res, next) => {
  try {
    const { name, country, pnl, trades, wins, streak, avatar, visible } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: "name is required" });
    }
    const t = await CustomTrader.create({
      name,
      country: country || "🌍",
      pnl: +pnl || 0,
      trades: +trades || 0,
      wins: +wins || 0,
      streak: +streak || 0,
      avatar: avatar || "",
      visible: visible !== false,
    });
    res.status(201).json({ success: true, trader: t });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/custom-traders/:id
exports.updateCustomTrader = async (req, res, next) => {
  try {
    const updates = req.body;
    delete updates._id;
    const t = await CustomTrader.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!t) return res.status(404).json({ success: false, message: "Trader not found" });
    res.json({ success: true, trader: t });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/custom-traders/:id
exports.deleteCustomTrader = async (req, res, next) => {
  try {
    await CustomTrader.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Trader removed from leaderboard" });
  } catch (err) {
    next(err);
  }
};

// ─── CANCEL STUCK TRADES ───
// POST /api/admin/trades/cancel-stuck
exports.cancelStuckTrades = async (req, res, next) => {
  try {
    const Trade = require("../models/Trade");
    const User = require("../models/User");
    const result = await Trade.updateMany(
      { status: "active", endTime: { $lte: Date.now() - 60000 } },
      { $set: { status: "cancelled", profitLoss: 0 } }
    );
    // Refund amounts to users
    const stuckTrades = await Trade.find({ status: "cancelled", profitLoss: 0, updatedAt: { $gte: new Date(Date.now() - 5000) } });
    for (const t of stuckTrades) {
      await User.findByIdAndUpdate(t.user, { $inc: { demoBalance: t.amount } });
    }
    res.json({ success: true, message: `${result.modifiedCount} stuck trades cancelled and refunded` });
  } catch (err) {
    next(err);
  }
};

// ─── OTC PRICE CONTROL (Pump/Dump) ───
// POST /api/admin/pairs/:id/price-control
exports.otcPriceControl = async (req, res, next) => {
  try {
    const Pair = require("../models/Pair");
    const pair = await Pair.findById(req.params.id);
    if (!pair) return res.status(404).json({ success: false, message: "Pair not found" });
    if (!pair.otc) return res.status(400).json({ success: false, message: "Not an OTC pair" });
    const { priceOffset, trendBias, basePrice } = req.body;
    if (priceOffset !== undefined) pair.priceOffset = Number(priceOffset);
    if (trendBias !== undefined) pair.trendBias = Math.max(-1, Math.min(1, Number(trendBias)));
    if (basePrice !== undefined) pair.basePrice = Number(basePrice);
    await pair.save();
    res.json({ success: true, message: `OTC price control updated for ${pair.label}`, pair: { symbol: pair.symbol, label: pair.label, priceOffset: pair.priceOffset, trendBias: pair.trendBias, basePrice: pair.basePrice } });
  } catch (err) {
    next(err);
  }
};

// ─── SEED DEFAULT OTC PAIRS ───
// POST /api/admin/pairs/seed-otc
exports.seedOtcPairs = async (req, res, next) => {
  try {
    const Pair = require("../models/Pair");
    const otcDefaults = [
      { symbol: "EURUSD_OTC", label: "EUR/USD (OTC)", short: "EUR/USD", pair: "EUR/USD", payout: 92, precision: 5, otc: true, basePrice: 1.08542, volatility: 0.00015, flag: "🇪🇺", category: "forex", sortOrder: 100 },
      { symbol: "GBPUSD_OTC", label: "GBP/USD (OTC)", short: "GBP/USD", pair: "GBP/USD", payout: 90, precision: 5, otc: true, basePrice: 1.27130, volatility: 0.00018, flag: "🇬🇧", category: "forex", sortOrder: 101 },
      { symbol: "USDJPY_OTC", label: "USD/JPY (OTC)", short: "USD/JPY", pair: "USD/JPY", payout: 91, precision: 3, otc: true, basePrice: 154.320, volatility: 0.025, flag: "🇯🇵", category: "forex", sortOrder: 102 },
      { symbol: "AUDUSD_OTC", label: "AUD/USD (OTC)", short: "AUD/USD", pair: "AUD/USD", payout: 88, precision: 5, otc: true, basePrice: 0.65420, volatility: 0.00012, flag: "🇦🇺", category: "forex", sortOrder: 103 },
      { symbol: "USDCAD_OTC", label: "USD/CAD (OTC)", short: "USD/CAD", pair: "USD/CAD", payout: 89, precision: 5, otc: true, basePrice: 1.36780, volatility: 0.00014, flag: "🇨🇦", category: "forex", sortOrder: 104 },
      { symbol: "EURGBP_OTC", label: "EUR/GBP (OTC)", short: "EUR/GBP", pair: "EUR/GBP", payout: 87, precision: 5, otc: true, basePrice: 0.85340, volatility: 0.00010, flag: "🇪🇺", category: "forex", sortOrder: 105 },
      { symbol: "NZDUSD_OTC", label: "NZD/USD (OTC)", short: "NZD/USD", pair: "NZD/USD", payout: 86, precision: 5, otc: true, basePrice: 0.59870, volatility: 0.00011, flag: "🇳🇿", category: "forex", sortOrder: 106 },
      { symbol: "USDCHF_OTC", label: "USD/CHF (OTC)", short: "USD/CHF", pair: "USD/CHF", payout: 88, precision: 5, otc: true, basePrice: 0.88240, volatility: 0.00013, flag: "🇨🇭", category: "forex", sortOrder: 107 },
      { symbol: "USDTRY_OTC", label: "USD/TRY (OTC)", short: "USD/TRY", pair: "USD/TRY", payout: 85, precision: 4, otc: true, basePrice: 32.4500, volatility: 0.0080, flag: "🇹🇷", category: "forex", sortOrder: 108 },
      { symbol: "EURJPY_OTC", label: "EUR/JPY (OTC)", short: "EUR/JPY", pair: "EUR/JPY", payout: 90, precision: 3, otc: true, basePrice: 167.450, volatility: 0.030, flag: "🇪🇺", category: "forex", sortOrder: 109 },
      { symbol: "GBPJPY_OTC", label: "GBP/JPY (OTC)", short: "GBP/JPY", pair: "GBP/JPY", payout: 89, precision: 3, otc: true, basePrice: 196.120, volatility: 0.035, flag: "🇬🇧", category: "forex", sortOrder: 110 },
      { symbol: "XAUUSD_OTC", label: "Gold (OTC)", short: "XAU/USD", pair: "XAU/USD", payout: 90, precision: 2, otc: true, basePrice: 2345.60, volatility: 0.50, flag: "🥇", category: "commodities", sortOrder: 111 },
    ];
    let created = 0, skipped = 0;
    for (const def of otcDefaults) {
      const exists = await Pair.findOne({ symbol: def.symbol });
      if (exists) { skipped++; continue; }
      await Pair.create(def);
      created++;
    }
    res.json({ success: true, message: `OTC pairs seeded: ${created} created, ${skipped} already existed` });
  } catch (err) {
    next(err);
  }
};

// ============== AFFILIATE / PARTNER MANAGEMENT ==============

const Partner = require("../models/Partner");
const Referral = require("../models/Referral");
const Commission = require("../models/Commission");
const ReferralLink = require("../models/ReferralLink");

// GET /api/admin/affiliates/stats — overall affiliate program stats
exports.getAffiliateStats = async (req, res, next) => {
  try {
    const [
      totalPartners,
      activePartners,
      totalCommissions,
      pendingWithdrawals,
      completedWithdrawals,
      totalReferrals,
      activeReferrals,
    ] = await Promise.all([
      Partner.countDocuments(),
      Partner.countDocuments({ isActive: true }),
      Commission.aggregate([
        { $match: { status: { $in: ["approved", "paid"] } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Withdrawal.aggregate([
        { $match: { status: "pending" } },
        { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
      ]),
      Withdrawal.aggregate([
        { $match: { status: "completed" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
      Referral.countDocuments(),
      Referral.countDocuments({ status: "active" }),
    ]);

    res.json({
      success: true,
      stats: {
        totalPartners,
        activePartners,
        totalCommissionsPaid: totalCommissions[0]?.total || 0,
        pendingWithdrawals: pendingWithdrawals[0]?.total || 0,
        pendingWithdrawalCount: pendingWithdrawals[0]?.count || 0,
        totalWithdrawn: completedWithdrawals[0]?.total || 0,
        totalReferrals,
        activeReferrals,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/affiliates — list all partners
exports.getAffiliates = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const search = req.query.search || "";

    const query = search
      ? {
          $or: [
            { name: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
            { partnerId: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const total = await Partner.countDocuments(query);
    const partners = await Partner.find(query)
      .select("-password")
      .sort("-createdAt")
      .skip((page - 1) * limit)
      .limit(limit);

    // Enrich with counts
    const enriched = await Promise.all(
      partners.map(async (p) => {
        const [referralCount, subCount, totalComm] = await Promise.all([
          Referral.countDocuments({ partner: p._id }),
          Partner.countDocuments({ masterPartner: p._id }),
          Commission.aggregate([
            { $match: { partner: p._id, status: { $in: ["approved", "paid"] } } },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ]),
        ]);
        return {
          ...p.toObject(),
          referralCount,
          subAffiliateCount: subCount,
          totalCommission: totalComm[0]?.total || 0,
        };
      })
    );

    res.json({ success: true, total, page, pages: Math.ceil(total / limit), partners: enriched });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/affiliates/:id — single partner detail
exports.getAffiliateDetail = async (req, res, next) => {
  try {
    const partner = await Partner.findById(req.params.id).select("-password");
    if (!partner) return res.status(404).json({ success: false, message: "Partner not found" });

    const [referrals, commissions, withdrawals, subAffiliates, links] = await Promise.all([
      Referral.find({ partner: partner._id }).sort("-createdAt"),
      Commission.find({ partner: partner._id }).sort("-createdAt").limit(50),
      Withdrawal.find({ partner: partner._id }).sort("-createdAt"),
      Partner.find({ masterPartner: partner._id }).select("name email partnerId tier createdAt"),
      ReferralLink.find({ partner: partner._id }),
    ]);

    res.json({ success: true, partner, referrals, commissions, withdrawals, subAffiliates, links });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/affiliates/:id — update partner (tier, status, balance)
exports.updateAffiliate = async (req, res, next) => {
  try {
    const { tier, isActive, availableBalance, totalBalance } = req.body;
    const partner = await Partner.findById(req.params.id);
    if (!partner) return res.status(404).json({ success: false, message: "Partner not found" });

    if (tier) partner.tier = tier;
    if (isActive !== undefined) partner.isActive = isActive;
    if (availableBalance !== undefined) partner.availableBalance = availableBalance;
    if (totalBalance !== undefined) partner.totalBalance = totalBalance;
    await partner.save();

    res.json({ success: true, message: "Partner updated", partner });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/affiliates/:id
exports.deleteAffiliate = async (req, res, next) => {
  try {
    const id = req.params.id;
    await Partner.findByIdAndDelete(id);
    await Referral.deleteMany({ partner: id });
    await Commission.deleteMany({ partner: id });
    await Withdrawal.deleteMany({ partner: id });
    await ReferralLink.deleteMany({ partner: id });
    res.json({ success: true, message: "Partner and all related data deleted" });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/affiliates-withdrawals — all affiliate withdrawal requests
exports.getAffiliateWithdrawals = async (req, res, next) => {
  try {
    const status = req.query.status || "";
    const query = status ? { status } : {};
    const withdrawals = await Withdrawal.find(query)
      .populate("partner", "name email partnerId")
      .sort("-createdAt");
    res.json({ success: true, withdrawals });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/affiliates-withdrawals/:id — approve/reject withdrawal
exports.processAffiliateWithdrawal = async (req, res, next) => {
  try {
    const { status, rejectionReason, transactionRef } = req.body;
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) return res.status(404).json({ success: false, message: "Withdrawal not found" });

    withdrawal.status = status;
    if (status === "completed") {
      withdrawal.processedAt = new Date();
      withdrawal.transactionRef = transactionRef || "";
      const partner = await Partner.findById(withdrawal.partner);
      partner.totalWithdrawn += withdrawal.amount;
      await partner.save();
    }
    if (status === "rejected") {
      withdrawal.rejectionReason = rejectionReason || "";
      const partner = await Partner.findById(withdrawal.partner);
      partner.availableBalance += withdrawal.amount;
      await partner.save();
    }
    await withdrawal.save();

    res.json({ success: true, message: `Withdrawal ${status}`, withdrawal });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/affiliates-commission — manually add commission
exports.addAffiliateCommission = async (req, res, next) => {
  try {
    const { partnerId, referralId, type, amount, rate, depositAmount, description } = req.body;
    const partner = await Partner.findById(partnerId);
    if (!partner) return res.status(404).json({ success: false, message: "Partner not found" });

    const commission = await Commission.create({
      partner: partnerId,
      referral: referralId || null,
      type: type || "RevShare",
      amount,
      rate: rate || partner.getCommissionRate(),
      depositAmount: depositAmount || 0,
      status: "approved",
      description: description || "",
    });

    partner.totalBalance += amount;
    partner.availableBalance += amount;
    await partner.save();

    // Sub-affiliate override (10%)
    if (partner.masterPartner) {
      const master = await Partner.findById(partner.masterPartner);
      if (master) {
        const subComm = amount * 0.1;
        await Commission.create({
          partner: master._id,
          referral: referralId || null,
          type: "SubAffiliate",
          amount: subComm,
          rate: 10,
          depositAmount,
          status: "approved",
          description: `Sub-affiliate commission from ${partner.name}`,
          sourcePartner: partner._id,
        });
        master.totalBalance += subComm;
        master.availableBalance += subComm;
        await master.save();
      }
    }

    res.status(201).json({ success: true, commission });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/affiliates-referral — add referral when user registers via link
exports.addAffiliateReferral = async (req, res, next) => {
  try {
    const { ref, clientName, clientEmail, clientUserId, source, campaignName } = req.body;
    const partner = await Partner.findOne({ referralCode: ref });
    if (!partner) return res.status(404).json({ success: false, message: "Invalid referral code" });

    const existing = await Referral.findOne({ clientEmail, partner: partner._id });
    if (existing) return res.status(400).json({ success: false, message: "Already referred" });

    const referral = await Referral.create({
      partner: partner._id,
      clientName,
      clientEmail,
      clientUserId: clientUserId || "",
      source: source || "direct",
      campaignName: campaignName || "",
    });

    // Update link signups
    if (source) {
      const link = await ReferralLink.findOne({ partner: partner._id, source });
      if (link) { link.signups += 1; await link.save(); }
    }

    // Update tier
    await partner.updateTier();

    res.status(201).json({ success: true, referral });
  } catch (err) {
    next(err);
  }
};

// ============== PROMO CODES (Full System) ==============
const PromoCode = mongoose.models.PromoCode || require("../models/PromoCode");

// GET /api/admin/promocodes — list all with stats
exports.getPromoCodes = async (req, res, next) => {
  try {
    const { type, status } = req.query;
    const query = {};
    if (type && type !== "all") query.type = type;
    if (status && status !== "all") query.status = status;

    const codes = await PromoCode.find(query)
      .populate("partner", "name email partnerId")
      .sort("-createdAt");

    // Stats
    const totalCodes = await PromoCode.countDocuments();
    const activeCodes = await PromoCode.countDocuments({ isActive: true, status: "approved" });
    const pendingCodes = await PromoCode.countDocuments({ status: "pending" });
    const customCodes = await PromoCode.countDocuments({ type: "custom" });
    const partnerCodes = await PromoCode.countDocuments({ type: "partner" });

    // Total bonus given
    const bonusAgg = await PromoCode.aggregate([
      { $unwind: "$usedBy" },
      { $group: { _id: null, totalBonus: { $sum: "$usedBy.bonus" }, totalUses: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      codes,
      stats: {
        totalCodes,
        activeCodes,
        pendingCodes,
        customCodes,
        partnerCodes,
        totalBonusGiven: bonusAgg[0]?.totalBonus || 0,
        totalRedemptions: bonusAgg[0]?.totalUses || 0,
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/promocodes — create custom promo code (admin)
exports.createPromoCode = async (req, res, next) => {
  try {
    const {
      code,
      discountType,
      discountValue,
      maxDiscount,
      minDeposit,
      maxUses,
      maxUsesPerUser,
      expiresAt,
      description,
      isActive,
    } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, message: "Code is required" });
    }
    if (!discountValue || discountValue <= 0) {
      return res.status(400).json({ success: false, message: "Discount value must be > 0" });
    }
    if (discountType === "percentage" && discountValue > 100) {
      return res.status(400).json({ success: false, message: "Percentage cannot exceed 100%" });
    }

    // Check duplicate
    const existing = await PromoCode.findOne({ code: code.trim().toUpperCase() });
    if (existing) {
      return res.status(400).json({ success: false, message: "Code already exists" });
    }

    const promo = await PromoCode.create({
      code: code.trim().toUpperCase(),
      type: "custom",
      partner: null,
      discountType: discountType || "percentage",
      discountValue: +discountValue,
      maxDiscount: +(maxDiscount || 0),
      minDeposit: +(minDeposit || 0),
      maxUses: +(maxUses || 0),
      maxUsesPerUser: +(maxUsesPerUser || 1),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      description: description || "",
      isActive: isActive !== false,
      status: "approved", // Admin-created codes are auto-approved
    });

    res.status(201).json({ success: true, message: "Promo code created", code: promo });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/promocodes/:id — update promo code
exports.updatePromoCode = async (req, res, next) => {
  try {
    const promo = await PromoCode.findById(req.params.id);
    if (!promo) return res.status(404).json({ success: false, message: "Not found" });

    const {
      status,
      discountType,
      discountValue,
      maxDiscount,
      minDeposit,
      maxUses,
      maxUsesPerUser,
      expiresAt,
      description,
      isActive,
    } = req.body;

    if (status) promo.status = status;
    if (discountType) promo.discountType = discountType;
    if (discountValue !== undefined) promo.discountValue = +discountValue;
    if (maxDiscount !== undefined) promo.maxDiscount = +maxDiscount;
    if (minDeposit !== undefined) promo.minDeposit = +minDeposit;
    if (maxUses !== undefined) promo.maxUses = +maxUses;
    if (maxUsesPerUser !== undefined) promo.maxUsesPerUser = +maxUsesPerUser;
    if (expiresAt !== undefined) promo.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (description !== undefined) promo.description = description;
    if (isActive !== undefined) promo.isActive = isActive;

    await promo.save();
    res.json({ success: true, message: "Promo code updated", code: promo });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/promocodes/:id
exports.deletePromoCode = async (req, res, next) => {
  try {
    await PromoCode.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/promocodes/:id/toggle — toggle active/inactive
exports.togglePromoCode = async (req, res, next) => {
  try {
    const promo = await PromoCode.findById(req.params.id);
    if (!promo) return res.status(404).json({ success: false, message: "Not found" });
    promo.isActive = !promo.isActive;
    await promo.save();
    res.json({ success: true, message: `Code ${promo.isActive ? "activated" : "deactivated"}`, code: promo });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/promocodes/:id/usage — detailed usage history
exports.getPromoCodeUsage = async (req, res, next) => {
  try {
    const promo = await PromoCode.findById(req.params.id).populate("usedBy.user", "name email country");
    if (!promo) return res.status(404).json({ success: false, message: "Not found" });
    res.json({
      success: true,
      code: promo.code,
      usageCount: promo.usageCount,
      usage: promo.usedBy,
    });
  } catch (err) {
    next(err);
  }
};

// ─── PUBLIC: Validate & Apply Promo Code (called from frontend deposit) ───

// POST /api/promo/validate — check if code is valid for user + amount
exports.validatePromoCode = async (req, res, next) => {
  try {
    const { code, amount } = req.body;
    const userId = req.user?._id || req.body.userId;

    if (!code) return res.status(400).json({ success: false, message: "Code is required" });

    const promo = await PromoCode.findOne({ code: code.trim().toUpperCase() });
    if (!promo) return res.status(404).json({ success: false, message: "Invalid promo code" });

    // Check usability
    const check = promo.canBeUsedBy(userId);
    if (!check.ok) return res.status(400).json({ success: false, message: check.reason });

    // Check min deposit
    if (amount && amount < promo.minDeposit) {
      return res.status(400).json({
        success: false,
        message: `Minimum deposit of $${promo.minDeposit} required for this code`,
      });
    }

    // Calculate bonus
    const bonus = promo.calculateBonus(amount || 0);

    res.json({
      success: true,
      message: "Code is valid!",
      promo: {
        code: promo.code,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        maxDiscount: promo.maxDiscount,
        minDeposit: promo.minDeposit,
        bonus,
        description: promo.description,
      },
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/promo/apply — apply promo code after deposit
exports.applyPromoCode = async (req, res, next) => {
  try {
    const { code, amount } = req.body;
    const userId = req.user?._id || req.body.userId;

    if (!code || !amount) {
      return res.status(400).json({ success: false, message: "Code and amount are required" });
    }

    const promo = await PromoCode.findOne({ code: code.trim().toUpperCase() });
    if (!promo) return res.status(404).json({ success: false, message: "Invalid promo code" });

    // Re-validate
    const check = promo.canBeUsedBy(userId);
    if (!check.ok) return res.status(400).json({ success: false, message: check.reason });

    if (amount < promo.minDeposit) {
      return res.status(400).json({
        success: false,
        message: `Minimum deposit of $${promo.minDeposit} required`,
      });
    }

    // Calculate and apply bonus
    const bonus = promo.calculateBonus(amount);
    if (bonus <= 0) {
      return res.status(400).json({ success: false, message: "No bonus applicable" });
    }

    // Add bonus to user's real balance
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    user.realBalance += bonus;
    await user.save();

    // Record usage
    promo.usedBy.push({
      user: userId,
      amount: +amount,
      bonus,
      usedAt: new Date(),
    });
    promo.usageCount += 1;
    await promo.save();

    // If partner code, add commission
    if (promo.type === "partner" && promo.partner) {
      try {
        const Commission = require("../models/Commission");
        const partnerDoc = await Partner.findById(promo.partner);
        if (partnerDoc) {
          const commRate = partnerDoc.getCommissionRate ? partnerDoc.getCommissionRate() : 3;
          const commAmount = (amount * commRate) / 100;
          await Commission.create({
            partner: partnerDoc._id,
            type: "PromoCode",
            amount: commAmount,
            rate: commRate,
            depositAmount: amount,
            status: "approved",
            description: `Promo code ${promo.code} used — deposit $${amount}`,
          });
          partnerDoc.totalBalance += commAmount;
          partnerDoc.availableBalance += commAmount;
          await partnerDoc.save();
        }
      } catch (e) {
        console.error("Promo commission error:", e.message);
      }
    }

    res.json({
      success: true,
      message: `Bonus of $${bonus.toFixed(2)} added to your balance!`,
      bonus,
      newBalance: user.realBalance,
    });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/withdrawals/:id/status — update withdrawal status with email
exports.updateWithdrawalStatus = async (req, res, next) => {
  try {
    const { status, rejectionReason } = req.body;
    if (!["pending", "processing", "completed", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Invalid status" });
    }
    const withdrawal = await Withdrawal.findById(req.params.id);
    if (!withdrawal) {
      return res.status(404).json({ success: false, message: "Withdrawal not found" });
    }

    const oldStatus = withdrawal.status;
    withdrawal.status = status;
    if (status === "rejected") {
      withdrawal.rejectionReason = rejectionReason || "Policy violation";
      // Refund the amount back to user
      const user = await User.findById(withdrawal.userId);
      if (user) {
        user.realBalance += withdrawal.amount;
        await user.save();
        sendWithdrawalRejectedEmail(user.email, user.name, {
          amount: withdrawal.amount,
          currency: withdrawal.currency,
          reason: rejectionReason || "Policy violation",
        }).catch(() => {});
      }
    } else if (status === "processing") {
      withdrawal.processedAt = new Date();
      const user = await User.findById(withdrawal.userId);
      if (user) {
        sendWithdrawalProcessingEmail(user.email, user.name, {
          amount: withdrawal.amount,
          currency: withdrawal.currency,
        }).catch(() => {});
      }
    } else if (status === "completed") {
      withdrawal.completedAt = new Date();
      const user = await User.findById(withdrawal.userId);
      if (user) {
        sendWithdrawalCompletedEmail(user.email, user.name, {
          amount: withdrawal.amount,
          currency: withdrawal.currency,
          walletAddress: withdrawal.walletAddress,
        }).catch(() => {});
      }
    }
    await withdrawal.save();
    res.json({ success: true, message: `Withdrawal ${status}`, withdrawal });
  } catch (err) { next(err); }
};
