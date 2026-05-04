const User = require("../models/User");
const Trade = require("../models/Trade");
const CustomTrader = require("../models/CustomTrader");

// GET /api/leaderboard?period=week|month|all&limit=50
exports.getLeaderboard = async (req, res, next) => {
  try {
    const period = req.query.period || "all";
    const limit = parseInt(req.query.limit) || 50;

    let dateFilter = {};
    const now = new Date();

    if (period === "week") {
      const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      dateFilter = { createdAt: { $gte: weekAgo } };
    } else if (period === "month") {
      const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
      dateFilter = { createdAt: { $gte: monthAgo } };
    }

    let leaderboard;

    if (period === "all") {
      // Real users
      const realUsers = await User.find({})
        .select("name country stats avatar")
        .sort("-stats.totalPnl")
        .limit(limit);

      const realList = realUsers.map((u) => ({
        userId: u._id,
        name: u.name,
        country: u.country || "🌍",
        avatar: u.avatar,
        pnl: u.stats.totalPnl || 0,
        winRate:
          u.stats.totalTrades > 0
            ? ((u.stats.wins / u.stats.totalTrades) * 100).toFixed(1)
            : "0.0",
        trades: u.stats.totalTrades || 0,
        streak: u.stats.bestStreak || 0,
        _type: "real",
      }));

      // Custom admin-added traders (visible only)
      const customTraders = await CustomTrader.find({ visible: true });
      const customList = customTraders.map((c) => ({
        userId: c._id,
        name: c.name,
        country: c.country || "🌍",
        avatar: c.avatar,
        pnl: c.pnl,
        winRate: c.trades > 0 ? ((c.wins / c.trades) * 100).toFixed(1) : "0.0",
        trades: c.trades,
        streak: c.streak,
        _type: "custom",
      }));

      // Merge + sort by pnl descending
      leaderboard = [...realList, ...customList]
        .sort((a, b) => b.pnl - a.pnl)
        .slice(0, limit)
        .map((u, idx) => ({ ...u, rank: idx + 1 }));
    } else {
      // Aggregate trades over the period
      const agg = await Trade.aggregate([
        { $match: { ...dateFilter, status: { $in: ["won", "lost"] } } },
        {
          $group: {
            _id: "$user",
            pnl: { $sum: "$profitLoss" },
            trades: { $sum: 1 },
            wins: {
              $sum: { $cond: [{ $eq: ["$status", "won"] }, 1, 0] },
            },
          },
        },
        { $sort: { pnl: -1 } },
        { $limit: limit },
      ]);

      // Populate user info
      const userIds = agg.map((a) => a._id);
      const users = await User.find({ _id: { $in: userIds } }).select(
        "name country avatar"
      );
      const userMap = {};
      users.forEach((u) => (userMap[u._id] = u));

      leaderboard = agg.map((a, idx) => {
        const u = userMap[a._id];
        return {
          rank: idx + 1,
          userId: a._id,
          name: u?.name || "Unknown",
          country: u?.country || "🌍",
          avatar: u?.avatar || "",
          pnl: a.pnl,
          winRate:
            a.trades > 0 ? ((a.wins / a.trades) * 100).toFixed(1) : "0.0",
          trades: a.trades,
          streak: 0, // streak is period-dependent, simplified
        };
      });
    }

    // Find user's own rank
    let myRank = null;
    if (req.user) {
      const myIdx = leaderboard.findIndex(
        (p) => p.userId.toString() === req.user._id.toString()
      );
      if (myIdx >= 0) {
        myRank = leaderboard[myIdx];
      } else {
        // Not in top N — compute actual rank
        const betterCount = await User.countDocuments({
          "stats.totalPnl": { $gt: req.user.stats.totalPnl },
        });
        myRank = {
          rank: betterCount + 1,
          userId: req.user._id,
          name: req.user.name,
          country: req.user.country || "🌍",
          pnl: req.user.stats.totalPnl,
          winRate:
            req.user.stats.totalTrades > 0
              ? (
                  (req.user.stats.wins / req.user.stats.totalTrades) *
                  100
                ).toFixed(1)
              : "0.0",
          trades: req.user.stats.totalTrades,
          streak: req.user.stats.bestStreak,
        };
      }
    }

    res.json({
      success: true,
      period,
      leaderboard,
      myRank,
    });
  } catch (err) {
    next(err);
  }
};
