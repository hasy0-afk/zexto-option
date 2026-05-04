const mongoose = require("mongoose");

// ─── Partner Schema ───
const partnerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: "" },
    password: { type: String, required: true },
    partnerId: { type: String, unique: true },
    tier: { type: String, enum: ["Silver", "Gold", "Platinum"], default: "Silver" },
    commissionRate: { type: Number, default: 3 }, // percentage
    totalEarned: { type: Number, default: 0 },
    availableBalance: { type: Number, default: 0 },
    totalWithdrawn: { type: Number, default: 0 },
    pendingBalance: { type: Number, default: 0 },
    totalClicks: { type: Number, default: 0 },
    masterPartnerId: { type: String, default: null }, // for sub-affiliate system
    paymentMethod: { type: String, default: "" },
    paymentAccount: { type: String, default: "" },
    paymentHolderName: { type: String, default: "" },
    status: { type: String, enum: ["active", "inactive", "suspended"], default: "active" },
  },
  { timestamps: true }
);

// Auto-generate partnerId before save
partnerSchema.pre("save", function (next) {
  if (!this.partnerId) {
    const random = Math.floor(1000 + Math.random() * 9000);
    this.partnerId = `ZXT-${random}`;
  }
  next();
});

// Update tier based on referral count
partnerSchema.methods.updateTier = async function () {
  const referralCount = await Referral.countDocuments({ partnerId: this._id, status: "active" });
  if (referralCount > 50) {
    this.tier = "Platinum";
    this.commissionRate = 8;
  } else if (referralCount > 10) {
    this.tier = "Gold";
    this.commissionRate = 5;
  } else {
    this.tier = "Silver";
    this.commissionRate = 3;
  }
  await this.save();
};

const Partner = mongoose.model("Partner", partnerSchema);

// ─── Referral Schema ───
const referralSchema = new mongoose.Schema(
  {
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: "Partner", required: true },
    name: { type: String, default: "Unknown User" },
    email: { type: String, default: "" },
    status: { type: String, enum: ["active", "pending", "inactive"], default: "pending" },
    totalDeposits: { type: Number, default: 0 },
    totalCommission: { type: Number, default: 0 },
    source: { type: String, default: "direct" },
    campaignName: { type: String, default: "" },
  },
  { timestamps: true }
);

const Referral = mongoose.model("Referral", referralSchema);

// ─── Commission Schema ───
const commissionSchema = new mongoose.Schema(
  {
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: "Partner", required: true },
    referralId: { type: mongoose.Schema.Types.ObjectId, ref: "Referral" },
    type: { type: String, enum: ["CPA", "RevShare", "SubAffiliate"], default: "RevShare" },
    amount: { type: Number, required: true },
    depositAmount: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },
    status: { type: String, enum: ["paid", "pending", "cancelled"], default: "pending" },
    description: { type: String, default: "" },
  },
  { timestamps: true }
);

const Commission = mongoose.model("Commission", commissionSchema);

// ─── Withdrawal Schema ───
const withdrawalSchema = new mongoose.Schema(
  {
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: "Partner", required: true },
    withdrawalId: { type: String, unique: true },
    amount: { type: Number, required: true, min: 50 },
    method: { type: String, required: true },
    accountDetails: { type: String, required: true },
    status: { type: String, enum: ["pending", "processing", "completed", "rejected"], default: "pending" },
    processedAt: { type: Date },
    rejectionReason: { type: String, default: "" },
  },
  { timestamps: true }
);

withdrawalSchema.pre("save", function (next) {
  if (!this.withdrawalId) {
    const num = Math.floor(100 + Math.random() * 900);
    this.withdrawalId = `WD-${Date.now().toString().slice(-4)}${num}`;
  }
  next();
});

const Withdrawal = mongoose.model("Withdrawal", withdrawalSchema);

// ─── Referral Link Schema ───
const referralLinkSchema = new mongoose.Schema(
  {
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: "Partner", required: true },
    campaignName: { type: String, required: true },
    source: { type: String, default: "direct" },
    url: { type: String, required: true },
    clicks: { type: Number, default: 0 },
    signups: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const ReferralLink = mongoose.model("ReferralLink", referralLinkSchema);

module.exports = { Partner, Referral, Commission, Withdrawal, ReferralLink };
