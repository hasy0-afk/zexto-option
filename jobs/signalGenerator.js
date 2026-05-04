const Signal = require("../models/Signal");
const { getPrices } = require("../utils/priceFetcher");

const PAIRS = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
];

const REASONS = [
  "RSI oversold on 5m",
  "Bullish engulfing pattern",
  "MACD crossover signal",
  "Support level bounce",
  "Breaking resistance",
  "Volume spike detected",
  "Triple bottom formation",
  "Moving average crossover",
  "Momentum shift upward",
  "Higher lows pattern",
];

const REASONS_DOWN = [
  "RSI overbought on 15m",
  "Bearish engulfing pattern",
  "MACD bearish divergence",
  "Rejection at resistance",
  "Breaking support level",
  "Volume declining",
  "Head and shoulders top",
  "Death cross forming",
  "Momentum weakening",
  "Lower highs pattern",
];

let priceHistory = {};

const generateSignal = async () => {
  try {
    const prices = await getPrices(PAIRS);
    if (Object.keys(prices).length === 0) return;

    // Pick a random pair for signal
    const pair = PAIRS[Math.floor(Math.random() * PAIRS.length)];
    const price = prices[pair];
    if (!price) return;

    // Track price history for basic momentum
    if (!priceHistory[pair]) priceHistory[pair] = [];
    priceHistory[pair].push(price);
    if (priceHistory[pair].length > 10) priceHistory[pair].shift();

    const history = priceHistory[pair];
    const momentum =
      history.length >= 3 ? history[history.length - 1] - history[0] : 0;

    // Direction based on momentum + randomness
    const direction = momentum > 0 ? "HIGHER" : momentum < 0 ? "LOWER" : Math.random() > 0.5 ? "HIGHER" : "LOWER";

    const strengths = ["Strong", "Medium", "Weak"];
    const strengthWeights = [0.25, 0.5, 0.25];
    let r = Math.random();
    let strength = "Medium";
    for (let i = 0; i < strengths.length; i++) {
      if (r < strengthWeights[i]) {
        strength = strengths[i];
        break;
      }
      r -= strengthWeights[i];
    }

    const confidence =
      strength === "Strong"
        ? 75 + Math.random() * 20
        : strength === "Medium"
        ? 55 + Math.random() * 20
        : 35 + Math.random() * 20;

    const reasonPool = direction === "HIGHER" ? REASONS : REASONS_DOWN;
    const reason = reasonPool[Math.floor(Math.random() * reasonPool.length)];

    const expiries = ["30s", "1m", "5m"];
    const expiry = expiries[Math.floor(Math.random() * expiries.length)];
    const expiryMs =
      expiry === "30s" ? 30000 : expiry === "1m" ? 60000 : 300000;

    const displayPair = pair.replace("USDT", "/USDT");

    await Signal.create({
      pair: displayPair,
      direction,
      strength,
      confidence: Math.round(confidence),
      reason,
      expiry,
      expiresAt: new Date(Date.now() + expiryMs),
    });

    console.log(
      `📡 Signal: ${displayPair} ${direction} (${strength}, ${Math.round(confidence)}%)`
    );
  } catch (err) {
    console.error("Signal generator error:", err.message);
  }
};

const startSignalGenerator = () => {
  const INTERVAL = 45000; // Every 45 seconds
  setInterval(generateSignal, INTERVAL);
  // Initial signal
  setTimeout(generateSignal, 5000);
  console.log(`📡 Signal generator started (every ${INTERVAL / 1000}s)`);
};

module.exports = { startSignalGenerator };
