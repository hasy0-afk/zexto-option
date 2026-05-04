const express = require("express");
const router = express.Router();
const { getSignals } = require("../controllers/signalController");

// Public — signals are not user-specific
router.get("/", getSignals);

module.exports = router;
