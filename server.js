require("dotenv").config();
const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");

const connectDB = require("./config/db");
const { errorHandler, notFound } = require("./middleware/error");
const { protectAdminPage, protectAdminAPI, generateAdminToken, ADMIN_USER, ADMIN_PASS } = require("./middleware/adminAuth");

const { startTradeResolver } = require("./jobs/tradeResolver");
const { startSignalGenerator } = require("./jobs/signalGenerator");
const { startTournamentUpdater } = require("./jobs/tournamentUpdater");

connectDB().then(() => {
  const app = express();

  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(cors({ origin: true, credentials: true }));

  const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 5000,
    message: { success: false, message: "Too many requests, slow down!" },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => process.env.NODE_ENV === "development" && process.env.DISABLE_RATE_LIMIT === "true",
  });
  app.use("/api", apiLimiter);

  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  });

  app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASS) {
      const token = generateAdminToken();
      res.json({ success: true, token, message: "Login successful" });
    } else {
      res.status(401).json({ success: false, message: "Invalid username or password" });
    }
  });

  app.get("/admin-login", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "admin-login.html"));
  });

  app.get("/", protectAdminPage, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "dashboard.html"));
  });

  app.use(express.static(path.join(__dirname, "public")));

  app.get("/api", (req, res) => {
    res.json({ success: true, message: "Zexto Option API is running", version: "1.0.0" });
  });

  app.use("/api/auth", require("./routes/auth"));
  app.use("/api/trades", require("./routes/trades"));
  app.use("/api/alerts", require("./routes/alerts"));
  app.use("/api/leaderboard", require("./routes/leaderboard"));
  app.use("/api/tournaments", require("./routes/tournaments"));
  app.use("/api/signals", require("./routes/signals"));
  app.use("/api/pairs", require("./routes/pairs"));
  app.use("/api/kyc", require("./routes/kyc"));
  app.use("/api/support", require("./routes/support"));
  app.use("/api/wallet", require("./routes/wallet"));
  app.use("/api/promo", require("./routes/promo"));

  // ★★★ FOREX ROUTES (TradingView - backup) ★★★
  const forexRouter = require("./routes/forex-routes");
  app.use("/api/forex", forexRouter);

  // ★★★ IQ OPTION ROUTES (NEW) ★★★
  const iqRouter = require("./routes/iqoption-routes");
  app.use("/api/iq", iqRouter);

  app.use("/api/admin/support", protectAdminAPI, require("./routes/support").adminRouter);
  app.use("/uploads/tickets", express.static(path.join(__dirname, "uploads/tickets")));
  app.use("/api/admin", protectAdminAPI, require("./routes/admin"));
  app.use("/api/affiliate", require("./routes/partnerAffiliate"));

  app.use(notFound);
  app.use(errorHandler);

  const PORT = process.env.PORT || 5000;
  const server = http.createServer(app);

  const { setupWebSocketServer } = require("./routes/forex-routes");
  setupWebSocketServer(server);

  const { setupIQWebSocketBridge } = require("./routes/iqoption-routes");
  setupIQWebSocketBridge(server);

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`
 ╔═══════════════════════════════════════════════════╗
 ║   🚀  Zexto Option API                            ║
 ║   📡  Running on http://localhost:${PORT}             ║
 ║   📊  Forex: ws://localhost:${PORT}/api/forex/stream  ║
 ║   ⚡  IQ Option: ws://localhost:${PORT}/api/iq/stream ║
 ╚═══════════════════════════════════════════════════╝
    `);

    startTradeResolver();
    startSignalGenerator();
    startTournamentUpdater();
    const { startDepositMonitor } = require("./jobs/depositMonitor");
    startDepositMonitor();
  });

});

process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled Rejection:", err.message);
});
