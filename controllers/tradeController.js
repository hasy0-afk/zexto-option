const Trade = require("../models/Trade");
const User = require("../models/User");
const { getCurrentPrice } = require("../utils/priceFetcher");

// POST /api/trades/open — open a new trade
exports.openTrade = async (req, res, next) => {
  try {
    const { symbol, pair, direction, amount, duration, payout, entry } = req.body;

    if (!symbol || !direction || !amount || !duration || !entry) {
      return res.status(400).json({
        success: false,
        message: "Missing required trade fields",
      });
    }

    if (!["HIGHER", "LOWER"].includes(direction)) {
      return res.status(400).json({
        success: false,
        message: "Direction must be HIGHER or LOWER",
      });
    }

    const user = await User.findById(req.user._id);
    if (user.demoBalance < amount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance",
      });
    }

    // Check limit: max 5 active trades per pair
    const activeCount = await Trade.countDocuments({
      user: user._id,
      symbol,
      status: "active",
    });
    if (activeCount >= 5) {
      return res.status(400).json({
        success: false,
        message: "Maximum 5 active trades per pair",
      });
    }

    const openTime = Date.now();
    const endTime = openTime + duration * 1000;

    // Deduct amount from balance
    user.demoBalance -= amount;
    await user.save();

    const trade = await Trade.create({
      user: user._id,
      symbol,
      pair: pair || symbol,
      direction,
      amount,
      payout: payout || 80,
      entry,
      openTime,
      endTime,
      duration,
      status: "active",
    });

    res.status(201).json({
      success: true,
      trade,
      newBalance: user.demoBalance,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/trades/resolve/:id — manually resolve a trade (auto-resolves via job too)
exports.resolveTrade = async (req, res, next) => {
  try {
    const trade = await Trade.findOne({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!trade) {
      return res.status(404).json({ success: false, message: "Trade not found" });
    }
    if (trade.status !== "active") {
      return res.status(400).json({
        success: false,
        message: `Trade already ${trade.status}`,
      });
    }
    if (Date.now() < trade.endTime) {
      return res.status(400).json({
        success: false,
        message: "Trade has not expired yet",
      });
    }

    const result = await settleTrade(trade);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

// Internal settlement logic (used by manual + auto job)
async function settleTrade(trade) {
  const currentPrice = await getCurrentPrice(trade.symbol);
  if (!currentPrice) {
    return { error: "Failed to fetch current price" };
  }

  const won =
    (trade.direction === "HIGHER" && currentPrice > trade.entry) ||
    (trade.direction === "LOWER" && currentPrice < trade.entry);
  const isTie = currentPrice === trade.entry;

  let profitLoss = 0;
  if (won) {
    profitLoss = trade.amount * (trade.payout / 100);
  } else if (isTie) {
    profitLoss = 0; // refund only
  } else {
    profitLoss = -trade.amount; // lost entire stake
  }

  trade.exit = currentPrice;
  trade.status = won ? "won" : isTie ? "cancelled" : "lost";
  trade.profitLoss = profitLoss;
  await trade.save();

  // Update user balance and stats
  const user = await User.findById(trade.user);
  if (won) {
    user.demoBalance += trade.amount + profitLoss; // return stake + profit
  } else if (isTie) {
    user.demoBalance += trade.amount; // refund stake
  }
  // If lost, stake was already deducted — nothing to do

  user.updateStats({ won, payout: profitLoss });
  await user.save();

  return {
    trade,
    won,
    isTie,
    currentPrice,
    profitLoss,
    newBalance: user.demoBalance,
    stats: user.stats,
  };
}

// GET /api/trades/active — active trades
exports.getActiveTrades = async (req, res, next) => {
  try {
    const trades = await Trade.find({
      user: req.user._id,
      status: "active",
    }).sort("-openTime");
    res.json({ success: true, trades });
  } catch (err) {
    next(err);
  }
};

// GET /api/trades/history — completed trades
exports.getHistory = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const trades = await Trade.find({
      user: req.user._id,
      status: { $in: ["won", "lost", "cancelled"] },
    })
      .sort("-createdAt")
      .limit(limit);
    res.json({ success: true, trades });
  } catch (err) {
    next(err);
  }
};

// GET /api/trades/stats — user's trading stats
exports.getStats = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const totalTrades = await Trade.countDocuments({ user: user._id });
    const activeTrades = await Trade.countDocuments({
      user: user._id,
      status: "active",
    });
    res.json({
      success: true,
      stats: user.stats,
      totalTrades,
      activeTrades,
      balance: user.demoBalance,
    });
  } catch (err) {
    next(err);
  }
};

module.exports.settleTrade = settleTrade;
