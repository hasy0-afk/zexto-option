const express = require("express");
const router = express.Router();
const {
  getTournaments,
  joinTournament,
  getTournamentLeaderboard,
} = require("../controllers/tournamentController");
const { protect } = require("../middleware/auth");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Optional auth middleware
const optionalAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
  } catch (err) {}
  next();
};

router.get("/", optionalAuth, getTournaments);
router.post("/:id/join", protect, joinTournament);
router.get("/:id/leaderboard", optionalAuth, getTournamentLeaderboard);

module.exports = router;
