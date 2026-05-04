const express = require("express");
const router = express.Router();
const admin = require("../controllers/adminController");

// Note: In production, add admin-only middleware here
// For local dev, admin panel is open

router.get("/stats", admin.getStats);

// Users
router.get("/users", admin.getAllUsers);
router.get("/users/:id", admin.getUserDetails);
router.delete("/users/:id", admin.deleteUser);
router.put("/users/:id/balance", admin.adjustBalance);

// Trades
router.get("/trades", admin.getAllTrades);

// Pairs
// ─── OTC ───
// Seed must come BEFORE :id routes
router.post("/pairs/seed-otc", admin.seedOtcPairs);

// Cancel stuck trades
router.post("/trades/cancel-stuck", admin.cancelStuckTrades);

router.get("/pairs", admin.getPairStats);
router.post("/pairs", admin.createPair);
router.put("/pairs/:id", admin.updatePair);
router.delete("/pairs/:id", admin.deletePair);
router.post("/pairs/:id/toggle", admin.togglePair);
router.post("/pairs/:id/price-control", admin.otcPriceControl);

// Deposits
router.get("/deposits", admin.getDeposits);
router.post("/deposits/:userId", admin.addDeposit);

// Withdrawals
router.get("/withdrawals", admin.getWithdrawals);
router.post("/withdrawals/:userId", admin.processWithdrawal);
router.put("/withdrawals/:id/status", admin.updateWithdrawalStatus);

// KYC
router.get("/kyc", admin.getKYC);
router.put("/kyc/:id", admin.updateKYC);
router.delete("/kyc/:id", admin.deleteKYC);

// Tournaments admin
router.get("/tournaments", admin.getAllTournaments);
router.post("/tournaments", admin.createTournament);
router.put("/tournaments/:id", admin.updateTournament);
router.delete("/tournaments/:id", admin.deleteTournament);

// Custom Traders (leaderboard)
router.get("/custom-traders", admin.getCustomTraders);
router.post("/custom-traders", admin.createCustomTrader);
router.put("/custom-traders/:id", admin.updateCustomTrader);
router.delete("/custom-traders/:id", admin.deleteCustomTrader);

// ============== AFFILIATE / PARTNER MANAGEMENT ==============
router.get("/affiliates", admin.getAffiliates);
router.get("/affiliates/stats", admin.getAffiliateStats);
router.get("/affiliates/:id", admin.getAffiliateDetail);
router.put("/affiliates/:id", admin.updateAffiliate);
router.delete("/affiliates/:id", admin.deleteAffiliate);
router.get("/affiliates-withdrawals", admin.getAffiliateWithdrawals);
router.put("/affiliates-withdrawals/:id", admin.processAffiliateWithdrawal);
router.post("/affiliates-commission", admin.addAffiliateCommission);
router.post("/affiliates-referral", admin.addAffiliateReferral);

// Promo Codes (Full System)
const promoFallback = (req, res) => res.status(500).json({ success: false, message: "Promo handler not loaded — update adminController.js" });
router.get("/promocodes", admin.getPromoCodes || promoFallback);
router.post("/promocodes", admin.createPromoCode || promoFallback);
router.put("/promocodes/:id", admin.updatePromoCode || promoFallback);
router.delete("/promocodes/:id", admin.deletePromoCode || promoFallback);
router.post("/promocodes/:id/toggle", admin.togglePromoCode || promoFallback);
router.get("/promocodes/:id/usage", admin.getPromoCodeUsage || promoFallback);

// ─── Deposit Promos (dashboard endpoint — maps to same PromoCode model) ───
const mongoose_dp = require("mongoose");
function getPromoModel() {
  if (mongoose_dp.models.PromoCode) return mongoose_dp.models.PromoCode;
  try { return require("../models/PromoCode"); } catch(e) {}
  return null;
}

// GET /api/admin/deposit-promos
router.get("/deposit-promos", async (req, res, next) => {
  try {
    const PM = getPromoModel();
    if (!PM) return res.json({ success: true, promos: [] });
    const codes = await PM.find({ type: "custom" }).sort("-createdAt");
    const promos = codes.map(c => ({
      _id: c._id,
      code: c.code,
      type: c.discountType || "percentage",
      value: c.discountValue || 0,
      minDeposit: c.minDeposit || 0,
      maxUses: c.maxUses || 0,
      usedCount: c.usageCount || 0,
      active: c.isActive && c.status === "approved",
      expiresAt: c.expiresAt,
      createdAt: c.createdAt,
    }));
    res.json({ success: true, promos });
  } catch (err) { next(err); }
});

// POST /api/admin/deposit-promos
router.post("/deposit-promos", async (req, res, next) => {
  try {
    const PM = getPromoModel();
    if (!PM) return res.status(500).json({ success: false, message: "PromoCode model not loaded" });
    const { code, type, value, minDeposit, maxUses, expiresAt } = req.body;
    if (!code || !value) return res.status(400).json({ success: false, message: "Code and value are required" });
    const existing = await PM.findOne({ code: code.trim().toUpperCase() });
    if (existing) return res.status(400).json({ success: false, message: "Code already exists" });
    const promo = await PM.create({
      code: code.trim().toUpperCase(),
      type: "custom",
      discountType: type || "percentage",
      discountValue: +value,
      minDeposit: +(minDeposit || 0),
      maxUses: +(maxUses || 0),
      maxUsesPerUser: 1,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      status: "approved",
      isActive: true,
    });
    res.status(201).json({ success: true, promo });
  } catch (err) { next(err); }
});

// PUT /api/admin/deposit-promos/:id
router.put("/deposit-promos/:id", async (req, res, next) => {
  try {
    const PM = getPromoModel();
    if (!PM) return res.status(500).json({ success: false, message: "PromoCode model not loaded" });
    const promo = await PM.findById(req.params.id);
    if (!promo) return res.status(404).json({ success: false, message: "Not found" });
    const { active, type, value, minDeposit, maxUses, expiresAt } = req.body;
    if (active !== undefined) { promo.isActive = active; promo.status = active ? "approved" : "rejected"; }
    if (type) promo.discountType = type;
    if (value !== undefined) promo.discountValue = +value;
    if (minDeposit !== undefined) promo.minDeposit = +minDeposit;
    if (maxUses !== undefined) promo.maxUses = +maxUses;
    if (expiresAt !== undefined) promo.expiresAt = expiresAt ? new Date(expiresAt) : null;
    await promo.save();
    res.json({ success: true, message: "Updated", promo });
  } catch (err) { next(err); }
});

// DELETE /api/admin/deposit-promos/:id
router.delete("/deposit-promos/:id", async (req, res, next) => {
  try {
    const PM = getPromoModel();
    if (!PM) return res.status(500).json({ success: false, message: "PromoCode model not loaded" });
    await PM.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) { next(err); }
});

module.exports = router;
