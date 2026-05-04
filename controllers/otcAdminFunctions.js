// ═══════════════════════════════════════════════════════
// ADD THESE FUNCTIONS TO YOUR EXISTING adminController.js
// ═══════════════════════════════════════════════════════

// ─── OTC PRICE CONTROL (Pump/Dump) ───
// POST /api/admin/pairs/:id/price-control
// Body: { priceOffset: 0.005, trendBias: 0.3 }
// priceOffset: direct price addition (e.g., +0.005 = pump EUR/USD by 0.005)
// trendBias: -1 to +1 (affects random walk direction, -1 = strong dump, +1 = strong pump, 0 = neutral)
exports.otcPriceControl = async (req, res) => {
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

    res.json({
      success: true,
      message: `OTC price control updated for ${pair.label}`,
      pair: {
        symbol: pair.symbol,
        label: pair.label,
        priceOffset: pair.priceOffset,
        trendBias: pair.trendBias,
        basePrice: pair.basePrice,
      },
    });
  } catch (err) {
    console.error("OTC price control error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─── SEED DEFAULT OTC PAIRS ───
// POST /api/admin/pairs/seed-otc
// Creates all default OTC forex pairs if they don't exist
exports.seedOtcPairs = async (req, res) => {
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

    let created = 0;
    let skipped = 0;

    for (const def of otcDefaults) {
      const exists = await Pair.findOne({ symbol: def.symbol });
      if (exists) {
        skipped++;
        continue;
      }
      await Pair.create(def);
      created++;
    }

    res.json({
      success: true,
      message: `OTC pairs seeded: ${created} created, ${skipped} already existed`,
      total: otcDefaults.length,
    });
  } catch (err) {
    console.error("Seed OTC error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};
