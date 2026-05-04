const mongoose = require("mongoose");

// Custom traders added by admin for display on leaderboard
// These are separate from real User accounts
const CustomTraderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      default: "🌍",
    },
    pnl: {
      type: Number,
      default: 0,
    },
    trades: {
      type: Number,
      default: 0,
    },
    wins: {
      type: Number,
      default: 0,
    },
    streak: {
      type: Number,
      default: 0,
    },
    avatar: {
      type: String,
      default: "",
    },
    visible: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

CustomTraderSchema.virtual("winRate").get(function () {
  return this.trades > 0 ? ((this.wins / this.trades) * 100).toFixed(1) : "0.0";
});

CustomTraderSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("CustomTrader", CustomTraderSchema);
