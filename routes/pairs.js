const express = require("express");
const router = express.Router();
const Pair = require("../models/Pair");

// GET /api/pairs — public, returns all enabled pairs
router.get("/", async (req, res) => {
  try {
    const pairs = await Pair.find({ enabled: true }).sort({ sortOrder: 1 }).lean();
    
    const formatted = pairs.map(p => ({
      s: p.symbol,
      label: p.label,
      short: p.short,
      payout: p.payout,
      prec: p.precision,
      logo: p.logo || "",
      // OTC fields
      otc: p.otc || false,
      basePrice: p.basePrice || 0,
      vol: p.volatility || 0.0001,
      flag: p.flag || "",
      priceOffset: p.priceOffset || 0,
      trendBias: p.trendBias || 0,
    }));

    res.json({ success: true, pairs: formatted });
  } catch (err) {
    console.error("Error fetching pairs:", err);
    res.status(500).json({ success: false, message: "Failed to fetch pairs" });
  }
});

module.exports = router;
