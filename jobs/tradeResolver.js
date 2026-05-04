const Trade = require("../models/Trade");
const User = require("../models/User");
const { settleTrade } = require("../controllers/tradeController");

// Track resolution failures per trade
const failureCounts = new Map();
const MAX_RETRIES = 3;

// Prevent overlapping runs (race condition fix)
let isResolving = false;

const startTradeResolver = () => {
  const RESOLVE_INTERVAL = 5000;

  setInterval(async () => {
    if (isResolving) return;
    isResolving = true;

    try {
      const expiredTrades = await Trade.find({
        status: "active",
        endTime: { $lte: Date.now() },
      }).limit(50);

      if (expiredTrades.length === 0) return;

      console.log(`⏱️  Resolving ${expiredTrades.length} expired trade(s)`);

      for (const trade of expiredTrades) {
        const tradeId = trade._id.toString();
        const failures = failureCounts.get(tradeId) || 0;

        // Max retries hit — cancel trade and refund user
        if (failures >= MAX_RETRIES) {
          try {
            // Use "cancelled" — it's the only valid non-win/loss status in the schema
            trade.status = "cancelled";
            trade.profitLoss = 0;
            trade.exit = trade.entry; // set exit = entry for cancelled trades
            await trade.save();

            // Refund the user's trade amount
            const user = await User.findById(trade.user);
            if (user) {
              user.demoBalance += trade.amount;
              await user.save();
              console.log(`  💰 Trade ${tradeId}: Refunded $${trade.amount.toFixed(2)} to user ${user.email}`);
            }
            failureCounts.delete(tradeId);
            console.log(`  🔴 Trade ${tradeId}: Cancelled after ${MAX_RETRIES} failed price fetch attempts (amount refunded)`);
          } catch (saveErr) {
            console.error(`  ❌ Could not cancel trade ${tradeId}:`, saveErr.message);
          }
          continue;
        }

        try {
          const result = await settleTrade(trade);
          if (result.error) {
            failureCounts.set(tradeId, failures + 1);
            console.error(`  ⚠️ Trade ${tradeId}: ${result.error} (attempt ${failures + 1}/${MAX_RETRIES})`);
          } else {
            failureCounts.delete(tradeId);
            console.log(
              `  ✅ Trade ${tradeId}: ${result.won ? "WON" : result.isTie ? "TIE" : "LOST"} (${result.profitLoss > 0 ? "+" : ""}${result.profitLoss.toFixed(2)})`
            );
          }
        } catch (err) {
          failureCounts.set(tradeId, failures + 1);
          console.error(`  ❌ Failed resolving ${tradeId} (attempt ${failures + 1}/${MAX_RETRIES}):`, err.message);
        }
      }
    } catch (err) {
      console.error("Trade resolver error:", err.message);
    } finally {
      isResolving = false;
    }
  }, RESOLVE_INTERVAL);

  console.log(`🔄 Trade resolver started (every ${RESOLVE_INTERVAL}ms)`);
};

module.exports = { startTradeResolver };
