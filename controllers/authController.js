const User = require("../models/User");
const crypto = require("crypto");
const generateToken = require("../utils/generateToken");
const { sendWelcomeEmail, sendPasswordResetEmail } = require("../utils/emailService");

// POST /api/auth/register
exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "Name, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(400).json({ success: false, message: "User with this email already exists" });
    }
    const user = await User.create({ name, email: email.toLowerCase(), password, demoBalance: +process.env.DEMO_BALANCE || 10000 });

    // Send welcome email (non-blocking)
    sendWelcomeEmail(user.email, user.name).catch(() => {});

    res.status(201).json({
      success: true, message: "Account created successfully", token: generateToken(user._id),
      user: { id: user._id, name: user.name, email: user.email, demoBalance: user.demoBalance, realBalance: user.realBalance, stats: user.stats, settings: user.settings },
    });
  } catch (err) { next(err); }
};

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: "Email and password are required" });
    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
    if (!user || !(await user.matchPassword(password))) return res.status(401).json({ success: false, message: "Invalid email or password" });
    user.lastLogin = new Date();
    await user.save();
    res.json({
      success: true, message: "Login successful", token: generateToken(user._id),
      user: { id: user._id, name: user.name, email: user.email, demoBalance: user.demoBalance, realBalance: user.realBalance, stats: user.stats, settings: user.settings },
    });
  } catch (err) { next(err); }
};

// GET /api/auth/me
exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({ success: true, user: { id: user._id, name: user.name, email: user.email, demoBalance: user.demoBalance, realBalance: user.realBalance, stats: user.stats, settings: user.settings, country: user.country } });
  } catch (err) { next(err); }
};

// PUT /api/auth/settings
exports.updateSettings = async (req, res, next) => {
  try {
    const { timezone, language, currency, sound, themeMode } = req.body;
    const user = await User.findById(req.user._id);
    if (timezone) user.settings.timezone = timezone;
    if (language) user.settings.language = language;
    if (currency) user.settings.currency = currency;
    if (typeof sound === "boolean") user.settings.sound = sound;
    if (themeMode) user.settings.themeMode = themeMode;
    await user.save();
    res.json({ success: true, settings: user.settings });
  } catch (err) { next(err); }
};

// POST /api/auth/reset-demo
exports.resetDemo = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    user.demoBalance = +process.env.DEMO_BALANCE || 10000;
    user.stats = { totalTrades: 0, wins: 0, losses: 0, totalPnl: 0, winStreak: 0, bestStreak: 0 };
    await user.save();
    res.json({ success: true, message: "Demo balance reset", demoBalance: user.demoBalance, stats: user.stats });
  } catch (err) { next(err); }
};

// POST /api/auth/forgot-password
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required" });
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.json({ success: true, message: "If this email is registered, you will receive a reset link" });
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save();
    sendPasswordResetEmail(user.email, user.name, resetToken).catch(() => {});
    res.json({ success: true, message: "If this email is registered, you will receive a reset link" });
  } catch (err) { next(err); }
};

// POST /api/auth/reset-password
exports.resetPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ success: false, message: "Token and new password are required" });
    if (password.length < 6) return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({ resetPasswordToken: hashedToken, resetPasswordExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ success: false, message: "Invalid or expired reset token" });
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    res.json({ success: true, message: "Password reset successfully" });
  } catch (err) { next(err); }
};
