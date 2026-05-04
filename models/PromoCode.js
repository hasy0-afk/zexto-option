const mongoose = require("mongoose");

const promoCodeSchema = new mongoose.Schema(
  {
    // Code itself
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },

    // Who created it — null means admin-created (custom)
    partner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Partner",
      default: null,
    },

    // Type: 'partner' = affiliate requested, 'custom' = admin created
    type: {
      type: String,
      enum: ["partner", "custom"],
      default: "custom",
    },

    // Discount config
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
      default: "percentage",
    },
    discountValue: {
      type: Number,
      default: 10, // 10% or $10
      min: 0,
    },
    maxDiscount: {
      type: Number,
      default: 0, // 0 = no cap (for percentage type)
    },

    // Constraints
    minDeposit: {
      type: Number,
      default: 0, // minimum deposit to apply
    },
    maxUses: {
      type: Number,
      default: 0, // 0 = unlimited
    },
    maxUsesPerUser: {
      type: Number,
      default: 1, // how many times one user can use
    },
    usageCount: {
      type: Number,
      default: 0,
    },

    // Users who used this code
    usedBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        amount: Number, // deposit amount
        bonus: Number, // bonus given
        usedAt: { type: Date, default: Date.now },
      },
    ],

    // Expiry
    expiresAt: {
      type: Date,
      default: null, // null = never expires
    },

    // Status
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "expired"],
      default: "approved",
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // Description / notes
    description: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Virtual: check if expired
promoCodeSchema.methods.isExpired = function () {
  if (!this.expiresAt) return false;
  return new Date() > this.expiresAt;
};

// Virtual: check if usage limit reached
promoCodeSchema.methods.isUsageLimitReached = function () {
  if (this.maxUses === 0) return false;
  return this.usageCount >= this.maxUses;
};

// Method: check if a specific user can use this code
promoCodeSchema.methods.canBeUsedBy = function (userId) {
  if (!this.isActive) return { ok: false, reason: "Code is inactive" };
  if (this.status !== "approved")
    return { ok: false, reason: "Code is not approved" };
  if (this.isExpired()) return { ok: false, reason: "Code has expired" };
  if (this.isUsageLimitReached())
    return { ok: false, reason: "Code usage limit reached" };

  // Check per-user limit
  const userUses = this.usedBy.filter(
    (u) => u.user.toString() === userId.toString()
  ).length;
  if (userUses >= this.maxUsesPerUser)
    return { ok: false, reason: "You have already used this code" };

  return { ok: true };
};

// Method: calculate bonus for a deposit amount
promoCodeSchema.methods.calculateBonus = function (depositAmount) {
  if (depositAmount < this.minDeposit) return 0;

  let bonus = 0;
  if (this.discountType === "percentage") {
    bonus = (depositAmount * this.discountValue) / 100;
    if (this.maxDiscount > 0) bonus = Math.min(bonus, this.maxDiscount);
  } else {
    bonus = this.discountValue;
  }
  return Math.round(bonus * 100) / 100;
};

module.exports = mongoose.model("PromoCode", promoCodeSchema);
