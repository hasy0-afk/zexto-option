const mongoose = require("mongoose");

const DepositSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  userName: { type: String, default: "" },
  userEmail: { type: String, default: "" },
  
  // Crypto details
  currency: { type: String, required: true, enum: ["BTC", "ETH", "BNB", "TRX", "LTC", "USDT_TRC20", "USDT_BEP20"] },
  network: { type: String, default: "" }, // bitcoin, ethereum, bsc, tron, litecoin
  depositAddress: { type: String, required: true }, // our wallet address user sent to
  
  // Transaction
  txHash: { type: String, default: "" },
  amount: { type: Number, default: 0 }, // crypto amount received
  amountUSD: { type: Number, default: 0 }, // converted to USD
  confirmations: { type: Number, default: 0 },
  requiredConfirmations: { type: Number, default: 1 },
  
  // Status
  status: { 
    type: String, 
    enum: ["pending", "confirming", "completed", "failed", "expired"],
    default: "pending" 
  },
  
  // Auto-detected or manual
  detectedAt: { type: Date },
  completedAt: { type: Date },
  creditedToUser: { type: Boolean, default: false },
  
  // Deposit ID for display
  depositId: { type: String, unique: true },
  
}, { timestamps: true });

// Auto-generate deposit ID
DepositSchema.pre("save", async function(next) {
  if (!this.depositId) {
    const count = await mongoose.model("Deposit").countDocuments();
    this.depositId = "DEP-" + String(count + 1).padStart(6, "0");
  }
  next();
});

module.exports = mongoose.model("Deposit", DepositSchema);
