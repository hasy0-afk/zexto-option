const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

// Safe model loader — never crashes, never overwrites
function getModel(name, schemaFn) {
  if (mongoose.models[name]) return mongoose.models[name];
  try { return require("../models/" + name); } catch (e) {}
  if (schemaFn) return mongoose.model(name, schemaFn());
  return null;
}

const User = getModel("User") || require("../models/User");

// PromoCode model — loads from file or defines inline
const PromoCode = getModel("PromoCode", () => {
  const s = new mongoose.Schema(
    {
      code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
      partner: { type: mongoose.Schema.Types.ObjectId, ref: "Partner", default: null },
      type: { type: String, enum: ["partner", "custom"], default: "custom" },
      discountType: { type: String, enum: ["percentage", "fixed"], default: "percentage" },
      discountValue: { type: Number, default: 10, min: 0 },
      maxDiscount: { type: Number, default: 0 },
      minDeposit: { type: Number, default: 0 },
      maxUses: { type: Number, default: 0 },
      maxUsesPerUser: { type: Number, default: 1 },
      usageCount: { type: Number, default: 0 },
      usedBy: [
        {
          user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
          amount: Number,
          bonus: Number,
          usedAt: { type: Date, default: Date.now },
        },
      ],
      expiresAt: { type: Date, default: null },
      status: { type: String, enum: ["pending", "approved", "rejected", "expired"], default: "approved" },
      isActive: { type: Boolean, default: true },
      description: { type: String, default: "" },
    },
    { timestamps: true }
  );

  s.methods.isExpired = function () {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  };
  s.methods.isUsageLimitReached = function () {
    if (this.maxUses === 0) return false;
    return this.usageCount >= this.maxUses;
  };
  s.methods.canBeUsedBy = function (userId) {
    if (!this.isActive) return { ok: false, reason: "Code is inactive" };
    if (this.status !== "approved") return { ok: false, reason: "Code is not approved" };
    if (this.isExpired()) return { ok: false, reason: "Code has expired" };
    if (this.isUsageLimitReached()) return { ok: false, reason: "Code usage limit reached" };
    const userUses = this.usedBy.filter((u) => u.user && u.user.toString() === userId.toString()).length;
    if (userUses >= this.maxUsesPerUser) return { ok: false, reason: "You have already used this code" };
    return { ok: true };
  };
  s.methods.calculateBonus = function (depositAmount) {
    if (this.minDeposit > 0 && depositAmount < this.minDeposit) return 0;
    let bonus = 0;
    if (this.discountType === "percentage") {
      bonus = (depositAmount * this.discountValue) / 100;
      if (this.maxDiscount > 0) bonus = Math.min(bonus, this.maxDiscount);
    } else {
      bonus = this.discountValue;
    }
    return Math.round(bonus * 100) / 100;
  };
  return s;
});

console.log("✅ Promo routes loaded, model:", PromoCode?.modelName || "FAILED");

// Auth middleware
const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (!token) return res.status(401).json({ success: false, message: "Login required" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user) return res.status(401).json({ success: false, message: "User not found" });
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// ============ POST /api/promo/validate ============
router.post("/validate", protect, async (req, res) => {
  try {
    const { code, amount } = req.body;
    if (!code) return res.status(400).json({ success: false, message: "Code is required" });

    const promo = await PromoCode.findOne({ code: code.trim().toUpperCase() });
    if (!promo) return res.status(400).json({ success: false, message: "Invalid promo code" });

    const check = promo.canBeUsedBy(req.user._id);
    if (!check.ok) return res.status(400).json({ success: false, message: check.reason });

    if (amount && promo.minDeposit > 0 && amount < promo.minDeposit) {
      return res.status(400).json({ success: false, message: `Minimum deposit of $${promo.minDeposit} required` });
    }

    const bonus = promo.calculateBonus(amount || 0);

    res.json({
      success: true,
      message: "Code is valid!",
      promo: {
        code: promo.code,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        maxDiscount: promo.maxDiscount,
        minDeposit: promo.minDeposit,
        bonus,
        description: promo.description,
      },
    });
  } catch (err) {
    console.error("❌ Promo validate error:", err);
    res.status(500).json({ success: false, message: "Server error validating code" });
  }
});

// ============ POST /api/promo/apply ============
router.post("/apply", protect, async (req, res) => {
  try {
    const { code, amount } = req.body;
    if (!code || !amount) return res.status(400).json({ success: false, message: "Code and amount required" });

    const promo = await PromoCode.findOne({ code: code.trim().toUpperCase() });
    if (!promo) return res.status(400).json({ success: false, message: "Invalid promo code" });

    const check = promo.canBeUsedBy(req.user._id);
    if (!check.ok) return res.status(400).json({ success: false, message: check.reason });

    if (promo.minDeposit > 0 && amount < promo.minDeposit) {
      return res.status(400).json({ success: false, message: `Minimum deposit of $${promo.minDeposit} required` });
    }

    const bonus = promo.calculateBonus(amount);
    if (bonus <= 0) return res.status(400).json({ success: false, message: "No bonus applicable" });

    // Add bonus
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    user.realBalance += bonus;
    await user.save();

    // Record usage
    promo.usedBy.push({ user: req.user._id, amount: +amount, bonus, usedAt: new Date() });
    promo.usageCount += 1;
    await promo.save();

    // Partner commission (safe — no model crash)
    if (promo.type === "partner" && promo.partner) {
      try {
        const Partner = getModel("Partner");
        const Commission = getModel("Commission");
        if (Partner && Commission) {
          const partnerDoc = await Partner.findById(promo.partner);
          if (partnerDoc) {
            const commRate = typeof partnerDoc.getCommissionRate === "function" ? partnerDoc.getCommissionRate() : 3;
            const commAmount = (amount * commRate) / 100;
            await Commission.create({
              partner: partnerDoc._id, type: "PromoCode", amount: commAmount,
              rate: commRate, depositAmount: amount, status: "approved",
              description: `Promo code ${promo.code} — deposit $${amount}`,
            });
            partnerDoc.totalBalance += commAmount;
            partnerDoc.availableBalance += commAmount;
            await partnerDoc.save();
          }
        }
      } catch (e) { console.error("Commission error:", e.message); }
    }

    res.json({
      success: true,
      message: `Bonus of $${bonus.toFixed(2)} added to your balance!`,
      bonus,
      newBalance: user.realBalance,
    });
  } catch (err) {
    console.error("❌ Promo apply error:", err);
    res.status(500).json({ success: false, message: "Server error applying code" });
  }
});

module.exports = router;
