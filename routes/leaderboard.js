const express = require("express");
const router = express.Router();
const { getLeaderboard } = require("../controllers/leaderboardController");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Optional auth — works without token too (for public dashboard)
const optionalAuth = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
  } catch (err) {
    // Ignore invalid token — still allow through
  }
  next();
};

// Public — works without auth, enriched if authenticated
router.get("/", optionalAuth, getLeaderboard);

module.exports = router;
