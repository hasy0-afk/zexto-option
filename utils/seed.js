require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Tournament = require("../models/Tournament");
const User = require("../models/User");
const Pair = require("../models/Pair");

const samplePairs = [
  { symbol: "BTCUSDT", label: "Bitcoin", short: "BTC", pair: "BTC/USDT", payout: 85, precision: 2, logo: "https://assets.coincap.io/assets/icons/btc@2x.png", category: "crypto", sortOrder: 1 },
  { symbol: "ETHUSDT", label: "Ethereum", short: "ETH", pair: "ETH/USDT", payout: 82, precision: 2, logo: "https://assets.coincap.io/assets/icons/eth@2x.png", category: "crypto", sortOrder: 2 },
  { symbol: "BNBUSDT", label: "BNB", short: "BNB", pair: "BNB/USDT", payout: 80, precision: 2, logo: "https://assets.coincap.io/assets/icons/bnb@2x.png", category: "crypto", sortOrder: 3 },
  { symbol: "SOLUSDT", label: "Solana", short: "SOL", pair: "SOL/USDT", payout: 83, precision: 2, logo: "https://assets.coincap.io/assets/icons/sol@2x.png", category: "crypto", sortOrder: 4 },
  { symbol: "XRPUSDT", label: "XRP", short: "XRP", pair: "XRP/USDT", payout: 78, precision: 4, logo: "https://assets.coincap.io/assets/icons/xrp@2x.png", category: "crypto", sortOrder: 5 },
  { symbol: "DOGEUSDT", label: "Doge", short: "DOGE", pair: "DOGE/USDT", payout: 76, precision: 5, logo: "https://assets.coincap.io/assets/icons/doge@2x.png", category: "crypto", sortOrder: 6 },
  { symbol: "ADAUSDT", label: "Cardano", short: "ADA", pair: "ADA/USDT", payout: 77, precision: 4, logo: "https://assets.coincap.io/assets/icons/ada@2x.png", category: "crypto", sortOrder: 7 },
  { symbol: "AVAXUSDT", label: "Avalanche", short: "AVAX", pair: "AVAX/USDT", payout: 79, precision: 2, logo: "https://assets.coincap.io/assets/icons/avax@2x.png", category: "crypto", sortOrder: 8 },
];

const sampleTournaments = [
  {
    title: "Daily Sprint",
    description: "Quick 24-hour tournament — trade fast, win big!",
    icon: "⚡",
    prize: 500,
    entryFee: 0,
    maxParticipants: 2000,
    startsAt: new Date(Date.now() - 4 * 3600 * 1000), // Started 4h ago
    endsAt: new Date(Date.now() + 20 * 3600 * 1000), // Ends in 20h
  },
  {
    title: "Weekend Warriors",
    description: "Weekend-long battle for top traders",
    icon: "🏆",
    prize: 2500,
    entryFee: 10,
    maxParticipants: 5000,
    startsAt: new Date(Date.now() - 8 * 3600 * 1000),
    endsAt: new Date(Date.now() + 40 * 3600 * 1000), // ~1d 16h left
  },
  {
    title: "Crypto Kings",
    description: "Elite traders only — $10K prize",
    icon: "👑",
    prize: 10000,
    entryFee: 50,
    maxParticipants: 1000,
    startsAt: new Date(Date.now() - 1 * 24 * 3600 * 1000),
    endsAt: new Date(Date.now() + 3 * 24 * 3600 * 1000 + 8 * 3600 * 1000),
  },
  {
    title: "Rising Stars",
    description: "For new traders — low entry, big prize pool",
    icon: "⭐",
    prize: 1000,
    entryFee: 5,
    maxParticipants: 3000,
    startsAt: new Date(Date.now() + 6 * 3600 * 1000), // Starts in 6h
    endsAt: new Date(Date.now() + 30 * 3600 * 1000),
  },
  {
    title: "Monthly Grand Prix",
    description: "The ultimate monthly championship",
    icon: "🏁",
    prize: 25000,
    entryFee: 100,
    maxParticipants: 2000,
    startsAt: new Date(Date.now() + 2 * 24 * 3600 * 1000),
    endsAt: new Date(Date.now() + 32 * 24 * 3600 * 1000),
  },
  {
    title: "Beginner's League",
    description: "Free entry — perfect for getting started",
    icon: "🎓",
    prize: 250,
    entryFee: 0,
    maxParticipants: 1000,
    startsAt: new Date(Date.now() - 2 * 3600 * 1000),
    endsAt: new Date(Date.now() + 12 * 3600 * 1000),
  },
];

// Fake users for leaderboard variety (optional)
const sampleUsers = [
  { name: "CryptoKing_94", email: "cryptoking@demo.local", country: "🇺🇸", stats: { totalTrades: 1245, wins: 976, losses: 269, totalPnl: 48765.23, winStreak: 0, bestStreak: 12 } },
  { name: "FxMaster", email: "fxmaster@demo.local", country: "🇷🇺", stats: { totalTrades: 987, wins: 742, losses: 245, totalPnl: 39210.50, winStreak: 0, bestStreak: 8 } },
  { name: "BinaryBoss", email: "binaryboss@demo.local", country: "🇬🇧", stats: { totalTrades: 856, wins: 632, losses: 224, totalPnl: 32150.75, winStreak: 0, bestStreak: 15 } },
  { name: "TradeWhale", email: "tradewhale@demo.local", country: "🇯🇵", stats: { totalTrades: 723, wins: 515, losses: 208, totalPnl: 28900.00, winStreak: 0, bestStreak: 5 } },
  { name: "PipHunter", email: "piphunter@demo.local", country: "🇩🇪", stats: { totalTrades: 612, wins: 425, losses: 187, totalPnl: 24567.80, winStreak: 0, bestStreak: 9 } },
  { name: "CandleWiz", email: "candlewiz@demo.local", country: "🇧🇷", stats: { totalTrades: 589, wins: 401, losses: 188, totalPnl: 21340.45, winStreak: 0, bestStreak: 4 } },
  { name: "SwingTrader", email: "swingtrader@demo.local", country: "🇮🇳", stats: { totalTrades: 542, wins: 365, losses: 177, totalPnl: 18920.30, winStreak: 0, bestStreak: 7 } },
  { name: "MarketMover", email: "marketmover@demo.local", country: "🇨🇦", stats: { totalTrades: 478, wins: 315, losses: 163, totalPnl: 15678.90, winStreak: 0, bestStreak: 3 } },
  { name: "ChartNinja", email: "chartninja@demo.local", country: "🇦🇺", stats: { totalTrades: 421, wins: 270, losses: 151, totalPnl: 12456.25, winStreak: 0, bestStreak: 6 } },
  { name: "ProfitPro", email: "profitpro@demo.local", country: "🇰🇷", stats: { totalTrades: 389, wins: 245, losses: 144, totalPnl: 10890.65, winStreak: 0, bestStreak: 2 } },
];

async function seed() {
  await connectDB();

  console.log("🌱 Seeding data...");

  // Pairs: upsert (only create if doesn't exist, preserves admin edits)
  for (const p of samplePairs) {
    const exists = await Pair.findOne({ symbol: p.symbol });
    if (!exists) await Pair.create(p);
  }
  console.log(`✅ Ensured ${samplePairs.length} trading pairs exist`);

  // Clean up old demo data
  // Remove fake demo users (@demo.local emails)
  const removedUsers = await User.deleteMany({ email: /@demo\.local$/ });
  if (removedUsers.deletedCount > 0) {
    console.log(`🧹 Removed ${removedUsers.deletedCount} fake demo users`);
  }

  // Remove any existing default tournaments (clean slate — admin adds custom ones)
  const removedTournaments = await Tournament.deleteMany({});
  if (removedTournaments.deletedCount > 0) {
    console.log(`🧹 Removed ${removedTournaments.deletedCount} default tournaments — admin can add custom ones via panel`);
  }

  console.log("✅ Seed complete!");
  console.log("");
  console.log("💡 Admin panel (http://localhost:5000):");
  console.log("   • Tournaments → '+ Add Tournament' to create custom ones");
  console.log("   • Ranking → '+ Add Trader' to add custom showcase traders");
  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
