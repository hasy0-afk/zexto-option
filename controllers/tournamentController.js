const Tournament = require("../models/Tournament");
const User = require("../models/User");

// GET /api/tournaments — list all (live + upcoming)
exports.getTournaments = async (req, res, next) => {
  try {
    const tournaments = await Tournament.find({
      status: { $in: ["upcoming", "live"] },
    }).sort("startsAt");

    // Auto-refresh status based on dates
    await Promise.all(
      tournaments.map(async (t) => {
        const oldStatus = t.status;
        const newStatus = t.refreshStatus();
        if (oldStatus !== newStatus) await t.save();
      })
    );

    // Add participant count + isJoined flag for current user
    const enriched = tournaments.map((t) => {
      const isJoined =
        req.user &&
        t.participants.some(
          (p) => p.user.toString() === req.user._id.toString()
        );
      const now = Date.now();
      let timeLeft = "";
      if (t.status === "upcoming") {
        const diff = t.startsAt - now;
        timeLeft = formatTime(diff);
      } else if (t.status === "live") {
        const diff = t.endsAt - now;
        timeLeft = formatTime(diff);
      }

      return {
        id: t._id,
        title: t.title,
        description: t.description,
        icon: t.icon,
        prize: t.prize,
        entryFee: t.entryFee,
        maxParticipants: t.maxParticipants,
        participantCount: t.participants.length,
        progress: Math.round((t.participants.length / t.maxParticipants) * 100),
        status: t.status,
        startsAt: t.startsAt,
        endsAt: t.endsAt,
        timeLeft,
        isJoined,
      };
    });

    res.json({ success: true, tournaments: enriched });
  } catch (err) {
    next(err);
  }
};

function formatTime(ms) {
  if (ms <= 0) return "0m";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// POST /api/tournaments/:id/join
exports.joinTournament = async (req, res, next) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }
    tournament.refreshStatus();
    if (tournament.status === "ended") {
      return res.status(400).json({
        success: false,
        message: "Tournament has ended",
      });
    }
    if (tournament.participants.length >= tournament.maxParticipants) {
      return res.status(400).json({
        success: false,
        message: "Tournament is full",
      });
    }
    const alreadyJoined = tournament.participants.some(
      (p) => p.user.toString() === req.user._id.toString()
    );
    if (alreadyJoined) {
      return res.status(400).json({
        success: false,
        message: "You have already joined this tournament",
      });
    }

    // Deduct entry fee if any
    if (tournament.entryFee > 0) {
      const user = await User.findById(req.user._id);
      if (user.demoBalance < tournament.entryFee) {
        return res.status(400).json({
          success: false,
          message: "Insufficient balance for entry fee",
        });
      }
      user.demoBalance -= tournament.entryFee;
      await user.save();
    }

    tournament.participants.push({
      user: req.user._id,
      joinedAt: new Date(),
      pnl: 0,
      trades: 0,
    });
    await tournament.save();

    res.json({
      success: true,
      message: "Joined tournament",
      participantCount: tournament.participants.length,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/tournaments/:id/leaderboard
exports.getTournamentLeaderboard = async (req, res, next) => {
  try {
    const t = await Tournament.findById(req.params.id).populate(
      "participants.user",
      "name country avatar"
    );
    if (!t) {
      return res.status(404).json({
        success: false,
        message: "Tournament not found",
      });
    }
    const sorted = [...t.participants].sort((a, b) => b.pnl - a.pnl);
    const leaderboard = sorted.map((p, idx) => ({
      rank: idx + 1,
      userId: p.user._id,
      name: p.user.name,
      country: p.user.country || "🌍",
      pnl: p.pnl,
      trades: p.trades,
    }));
    res.json({
      success: true,
      tournament: {
        id: t._id,
        title: t.title,
        prize: t.prize,
        status: t.status,
      },
      leaderboard,
    });
  } catch (err) {
    next(err);
  }
};
