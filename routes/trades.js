const express = require("express");
const router = express.Router();
const {
  openTrade,
  resolveTrade,
  getActiveTrades,
  getHistory,
  getStats,
} = require("../controllers/tradeController");
const { protect } = require("../middleware/auth");

router.use(protect); // All trade routes require auth

router.post("/open", openTrade);
router.post("/resolve/:id", resolveTrade);
router.get("/active", getActiveTrades);
router.get("/history", getHistory);
router.get("/stats", getStats);

module.exports = router;
