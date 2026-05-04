const Pair = require("../models/Pair");

// GET /api/pairs — public, returns all enabled pairs
exports.getPairs = async (req, res, next) => {
  try {
    const pairs = await Pair.find({ enabled: true }).sort("sortOrder symbol");
    res.json({
      success: true,
      pairs: pairs.map((p) => ({
        s: p.symbol,
        label: p.label,
        short: p.short,
        pair: p.pair,
        payout: p.payout,
        prec: p.precision,
        logo: p.logo,
        category: p.category,
        minAmount: p.minAmount,
        maxAmount: p.maxAmount,
      })),
    });
  } catch (err) {
    next(err);
  }
};
