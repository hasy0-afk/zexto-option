const mongoose = require("mongoose");

const TradeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    symbol: {
      type: String,
      required: true, // e.g. "BTCUSDT"
    },
    pair: String, // display: "BTC/USDT"
    direction: {
      type: String,
      enum: ["HIGHER", "LOWER"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    payout: {
      type: Number, // profit % (e.g. 85 means 85%)
      required: true,
    },
    entry: {
      type: Number, // entry price
      required: true,
    },
    exit: {
      type: Number, // exit price (set when trade resolves)
    },
    openTime: {
      type: Number, // timestamp ms
      required: true,
    },
    endTime: {
      type: Number, // timestamp ms when trade settles
      required: true,
    },
    duration: {
      type: Number, // in seconds
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "won", "lost", "cancelled"],
      default: "active",
      index: true,
    },
    profitLoss: {
      type: Number, // final P/L (+ for win, - for loss)
      default: 0,
    },
    // Optional: which tournament this belonged to
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
    },
  },
  { timestamps: true }
);

TradeSchema.index({ user: 1, status: 1 });
TradeSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Trade", TradeSchema);
