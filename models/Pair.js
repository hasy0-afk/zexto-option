const mongoose = require("mongoose");

const PairSchema = new mongoose.Schema(
  {
    symbol: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    label: {
      type: String,
      required: true,
    },
    short: {
      type: String,
      required: true,
    },
    pair: {
      type: String,
      required: true,
    },
    payout: {
      type: Number,
      required: true,
      default: 80,
      min: 0,
      max: 100,
    },
    precision: {
      type: Number,
      default: 2,
      min: 0,
      max: 8,
    },
    logo: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      enum: ["crypto", "forex", "stocks", "indices", "commodities"],
      default: "crypto",
    },
    enabled: {
      type: Boolean,
      default: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    minAmount: {
      type: Number,
      default: 1,
    },
    maxAmount: {
      type: Number,
      default: 10000,
    },
    // ─── OTC FIELDS ───
    otc: {
      type: Boolean,
      default: false,
    },
    basePrice: {
      type: Number,
      default: 0,
    },
    volatility: {
      type: Number,
      default: 0.0001,
    },
    flag: {
      type: String,
      default: "",
    },
    // Price manipulation: admin can pump/dump OTC price
    // This offset is added to the generated price
    priceOffset: {
      type: Number,
      default: 0,
    },
    // Trend bias: -1 to +1 (negative = dump, positive = pump)
    // 0 = neutral random walk
    trendBias: {
      type: Number,
      default: 0,
      min: -1,
      max: 1,
    },
  },
  { timestamps: true }
);

PairSchema.index({ enabled: 1, sortOrder: 1 });
PairSchema.index({ otc: 1 });

module.exports = mongoose.model("Pair", PairSchema);
