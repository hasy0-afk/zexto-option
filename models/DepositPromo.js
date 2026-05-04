const mongoose = require("mongoose");

const depositPromoSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  type: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
  value: { type: Number, required: true }, // percentage (e.g. 50 = 50%) or fixed dollar amount
  minDeposit: { type: Number, default: 10 },
  maxUses: { type: Number, default: 0 }, // 0 = unlimited
  usedCount: { type: Number, default: 0 },
  usedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  expiresAt: { type: Date, default: null },
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model("DepositPromo", depositPromoSchema);
