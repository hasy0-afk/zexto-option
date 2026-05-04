const mongoose = require("mongoose");

const AlertSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    pair: {
      type: String, // "BTC/USDT"
      required: true,
    },
    symbol: String, // "BTCUSDT"
    price: {
      type: Number,
      required: true,
    },
    direction: {
      type: String,
      enum: ["above", "below"],
      required: true,
    },
    triggered: {
      type: Boolean,
      default: false,
    },
    triggeredAt: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("Alert", AlertSchema);
