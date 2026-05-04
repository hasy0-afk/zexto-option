const mongoose = require("mongoose");

const SignalSchema = new mongoose.Schema(
  {
    pair: {
      type: String,
      required: true,
    },
    direction: {
      type: String,
      enum: ["HIGHER", "LOWER"],
      required: true,
    },
    strength: {
      type: String,
      enum: ["Strong", "Medium", "Weak"],
      default: "Medium",
    },
    confidence: {
      type: Number, // 0-100
      required: true,
    },
    reason: String,
    expiry: {
      type: String, // "1m", "5m", "30s"
      default: "1m",
    },
    expiresAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Auto-delete old signals after 1 hour
SignalSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

module.exports = mongoose.model("Signal", SignalSchema);
