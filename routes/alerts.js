const express = require("express");
const router = express.Router();
const {
  getAlerts,
  createAlert,
  deleteAlert,
} = require("../controllers/alertController");
const { protect } = require("../middleware/auth");

router.use(protect);

router.get("/", getAlerts);
router.post("/", createAlert);
router.delete("/:id", deleteAlert);

module.exports = router;
