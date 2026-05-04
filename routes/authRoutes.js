const express = require("express");
const router = express.Router();
const { register, login, getMe, updateSettings, resetDemo, forgotPassword, resetPassword } = require("../controllers/authController");
const { protect } = require("../middleware/auth");

router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, getMe);
router.put("/settings", protect, updateSettings);
router.post("/reset-demo", protect, resetDemo);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

module.exports = router;
