const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: 50,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },
    demoBalance: {
      type: Number,
      default: 10000,
    },
    realBalance: {
      type: Number,
      default: 0,
    },
    country: {
      type: String,
      default: "🌍",
    },
    avatar: {
      type: String,
      default: "",
    },
    // HD Wallet deposit addresses (unique per user)
    depositAddresses: {
      BTC: { type: String, default: "" },
      ETH: { type: String, default: "" },
      BNB: { type: String, default: "" },
      TRX: { type: String, default: "" },
      LTC: { type: String, default: "" },
      USDT_TRC20: { type: String, default: "" },
      USDT_BEP20: { type: String, default: "" },
    },
    walletIndex: { type: Number, default: 0 },
    // Trading stats
    stats: {
      totalTrades: { type: Number, default: 0 },
      wins: { type: Number, default: 0 },
      losses: { type: Number, default: 0 },
      totalPnl: { type: Number, default: 0 },
      winStreak: { type: Number, default: 0 },
      bestStreak: { type: Number, default: 0 },
    },
    // User settings
    settings: {
      timezone: { type: String, default: "UTC+05:00 (PKT)" },
      language: { type: String, default: "en" },
      currency: { type: String, default: "USD" },
      sound: { type: Boolean, default: true },
      themeMode: { type: String, default: "dark" },
    },
    // Joined tournaments
    tournaments: [
      {
        tournamentId: { type: mongoose.Schema.Types.ObjectId, ref: "Tournament" },
        joinedAt: { type: Date, default: Date.now },
        pnl: { type: Number, default: 0 },
      },
    ],
    lastLogin: Date,
  },
  { timestamps: true }
);

UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

UserSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

UserSchema.methods.updateStats = function (trade) {
  this.stats.totalTrades += 1;
  if (trade.won) {
    this.stats.wins += 1;
    this.stats.winStreak += 1;
    if (this.stats.winStreak > this.stats.bestStreak) {
      this.stats.bestStreak = this.stats.winStreak;
    }
  } else {
    this.stats.losses += 1;
    this.stats.winStreak = 0;
  }
  this.stats.totalPnl += trade.payout;
};

module.exports = mongoose.model("User", UserSchema);
