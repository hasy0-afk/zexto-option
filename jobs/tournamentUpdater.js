const Tournament = require("../models/Tournament");
const User = require("../models/User");

// Update tournament statuses + distribute prizes every minute
const startTournamentUpdater = () => {
  const INTERVAL = 60000; // 1 minute

  setInterval(async () => {
    try {
      const all = await Tournament.find({
        status: { $in: ["upcoming", "live"] },
      });

      for (const t of all) {
        const oldStatus = t.status;
        const newStatus = t.refreshStatus();

        // If just ended — distribute prize to top participant
        if (
          oldStatus === "live" &&
          newStatus === "ended" &&
          !t.prizeDistributed &&
          t.participants.length > 0
        ) {
          const sorted = [...t.participants].sort((a, b) => b.pnl - a.pnl);
          const winner = sorted[0];
          if (winner) {
            t.winner = winner.user;
            t.prizeDistributed = true;

            // Award prize to winner
            const winnerUser = await User.findById(winner.user);
            if (winnerUser) {
              winnerUser.demoBalance += t.prize;
              await winnerUser.save();
              console.log(
                `🏆 Tournament "${t.title}" ended — winner: ${winnerUser.name} won $${t.prize}`
              );
            }
          }
        }

        if (oldStatus !== newStatus) {
          await t.save();
          console.log(`🏆 Tournament "${t.title}" status: ${oldStatus} → ${newStatus}`);
        }
      }
    } catch (err) {
      console.error("Tournament updater error:", err.message);
    }
  }, INTERVAL);

  console.log(`🏆 Tournament updater started (every ${INTERVAL / 1000}s)`);
};

module.exports = { startTournamentUpdater };
