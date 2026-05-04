const Alert = require("../models/Alert");

// GET /api/alerts — all user's active alerts
exports.getAlerts = async (req, res, next) => {
  try {
    const alerts = await Alert.find({
      user: req.user._id,
      triggered: false,
    }).sort("-createdAt");
    res.json({ success: true, alerts });
  } catch (err) {
    next(err);
  }
};

// POST /api/alerts — create new alert
exports.createAlert = async (req, res, next) => {
  try {
    const { pair, symbol, price, direction } = req.body;
    if (!pair || !price || !direction) {
      return res.status(400).json({
        success: false,
        message: "Pair, price and direction are required",
      });
    }
    if (!["above", "below"].includes(direction)) {
      return res.status(400).json({
        success: false,
        message: "Direction must be 'above' or 'below'",
      });
    }

    const alert = await Alert.create({
      user: req.user._id,
      pair,
      symbol: symbol || pair.replace("/", ""),
      price: +price,
      direction,
    });

    res.status(201).json({ success: true, alert });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/alerts/:id
exports.deleteAlert = async (req, res, next) => {
  try {
    const alert = await Alert.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!alert) {
      return res.status(404).json({ success: false, message: "Alert not found" });
    }
    res.json({ success: true, message: "Alert deleted" });
  } catch (err) {
    next(err);
  }
};

// POST /api/alerts/:id/trigger — mark triggered (called internally by price monitor)
exports.triggerAlert = async (alertId) => {
  const alert = await Alert.findById(alertId);
  if (alert) {
    alert.triggered = true;
    alert.triggeredAt = new Date();
    await alert.save();
  }
  return alert;
};
