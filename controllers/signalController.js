const Signal = require("../models/Signal");

// GET /api/signals — latest signals
exports.getSignals = async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const signals = await Signal.find({})
      .sort("-createdAt")
      .limit(limit);
    res.json({ success: true, signals });
  } catch (err) {
    next(err);
  }
};
