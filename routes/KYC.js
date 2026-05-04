const router = require("express").Router();
const { protect } = require("../middleware/auth");
const { getMyKYC, submitKYC } = require("../controllers/kycController");

// User routes (require auth)
router.get("/me", protect, getMyKYC);
router.post("/", protect, submitKYC);

module.exports = router;