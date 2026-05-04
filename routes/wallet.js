const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const Deposit = require("../models/Deposit");
const Withdrawal = require("../models/Withdrawal");
const User = require("../models/User");
const { generateAddresses } = require("../services/hdWallet");
const { sendWithdrawalEmail } = require("../utils/emailService");

const CURRENCIES = {
  BTC: { name: "Bitcoin", icon: "₿", network: "bitcoin", color: "#F7931A", min: 10, confirmations: 2 },
  ETH: { name: "Ethereum", icon: "Ξ", network: "ethereum", color: "#627EEA", min: 10, confirmations: 12 },
  BNB: { name: "BNB (BSC)", icon: "◆", network: "bsc", color: "#F0B90B", min: 10, confirmations: 15 },
  TRX: { name: "Tron", icon: "T", network: "tron", color: "#FF0013", min: 10, confirmations: 20 },
  LTC: { name: "Litecoin", icon: "Ł", network: "litecoin", color: "#345D9D", min: 10, confirmations: 6 },
  USDT_TRC20: { name: "USDT (TRC20)", icon: "₮", network: "tron", color: "#26A17B", min: 10, confirmations: 20 },
  USDT_BEP20: { name: "USDT (BEP20)", icon: "₮", network: "bsc", color: "#26A17B", min: 10, confirmations: 15 },
};

router.get("/deposit-addresses", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.json({ success: false, error: "User not found" });
    if (!user.depositAddresses || !user.depositAddresses.BTC) {
      const userCount = await User.countDocuments({ _id: { $lte: user._id } });
      const addresses = generateAddresses(userCount);
      if (!addresses) return res.json({ success: false, error: "Failed to generate addresses" });
      user.depositAddresses = addresses;
      user.walletIndex = userCount;
      await user.save();
    }
    const currencies = Object.entries(CURRENCIES).map(([id, info]) => ({ id, ...info, address: user.depositAddresses[id] || "" }));
    res.json({ success: true, currencies });
  } catch (err) { res.json({ success: false, error: "Failed to get deposit addresses" }); }
});

router.get("/deposits", protect, async (req, res) => {
  try {
    const deposits = await Deposit.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, deposits });
  } catch (err) { res.json({ success: false, error: "Failed to fetch deposits" }); }
});

router.post("/withdraw", protect, async (req, res) => {
  try {
    const { currency, walletAddress, amount } = req.body;
    if (!currency || !walletAddress || !amount) return res.json({ success: false, error: "Currency, wallet address and amount are required" });
    if (amount < 12) return res.json({ success: false, error: "Minimum withdrawal is $12" });
    const user = await User.findById(req.user._id);
    if (!user) return res.json({ success: false, error: "User not found" });
    if (user.realBalance < amount) return res.json({ success: false, error: "Insufficient balance" });
    user.realBalance -= amount;
    await user.save();
    const withdrawal = new Withdrawal({ userId: req.user._id, userName: req.user.name, userEmail: req.user.email, currency, network: CURRENCIES[currency]?.network || "", walletAddress, amount, status: "pending" });
    await withdrawal.save();

    // Send withdrawal email (non-blocking)
    sendWithdrawalEmail(user.email, user.name, { currency, amount, walletAddress, newBalance: user.realBalance }).catch(() => {});

    res.json({ success: true, withdrawal, newBalance: user.realBalance });
  } catch (err) { res.json({ success: false, error: "Failed to create withdrawal" }); }
});

router.get("/withdrawals", protect, async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(50);
    res.json({ success: true, withdrawals });
  } catch (err) { res.json({ success: false, error: "Failed to fetch withdrawals" }); }
});

router.get("/summary", protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const totalDeposited = await Deposit.aggregate([{ $match: { userId: req.user._id, status: "completed" } }, { $group: { _id: null, total: { $sum: "$amountUSD" } } }]);
    const totalWithdrawn = await Withdrawal.aggregate([{ $match: { userId: req.user._id, status: "completed" } }, { $group: { _id: null, total: { $sum: "$amount" } } }]);
    res.json({ success: true, realBalance: user?.realBalance || 0, demoBalance: user?.demoBalance || 0, totalDeposited: totalDeposited[0]?.total || 0, totalWithdrawn: totalWithdrawn[0]?.total || 0 });
  } catch (err) { res.json({ success: false, error: "Failed to fetch summary" }); }
});

module.exports = router;
