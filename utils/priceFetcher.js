// Server-side price fetcher for trade resolution
// Handles both Binance crypto pairs AND OTC forex pairs
// Includes fallback APIs for regions where Binance is blocked (e.g. Pakistan)

const Pair = require("../models/Pair");

// ─── Caches ───
const otcPriceCache = {};
const priceCache = {};
const CACHE_TTL = 60000; // 60s

// ─── Helpers ───

const fetchWithTimeout = async (url, timeoutMs = 5000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
};

const isValidPrice = (p) => typeof p === "number" && !isNaN(p) && p > 0 && isFinite(p);

// ─── OTC Price Generation (local, no external API) ───

const getOtcPrice = async (symbol) => {
  try {
    const pair = await Pair.findOne({ symbol, otc: true }).lean();
    if (!pair) return null;

    const base = pair.basePrice || 1;
    const vol = pair.volatility || 0.0001;
    const bias = pair.trendBias || 0;
    const offset = pair.priceOffset || 0;

    const lastPrice = otcPriceCache[symbol] || base;
    const drift = bias * vol * 0.3;
    const move = (Math.random() - 0.48) * vol * 2 + drift;
    const newPrice = lastPrice + move + offset * 0.001;

    const prec = pair.precision || 5;
    const finalPrice = parseFloat(newPrice.toFixed(prec));

    otcPriceCache[symbol] = finalPrice;
    return finalPrice;
  } catch (err) {
    console.error(`OTC price error for ${symbol}:`, err.message);
    return null;
  }
};

// ─── Source 1: Binance ───

const fetchFromBinance = async (symbol) => {
  try {
    const res = await fetchWithTimeout(
      `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code || !data.price) return null;
    const price = parseFloat(data.price);
    return isValidPrice(price) ? price : null;
  } catch {
    return null;
  }
};

// ─── Source 2: Binance alternate domain ───

const fetchFromBinanceAlt = async (symbol) => {
  try {
    const res = await fetchWithTimeout(
      `https://api1.binance.com/api/v3/ticker/price?symbol=${symbol}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code || !data.price) return null;
    const price = parseFloat(data.price);
    return isValidPrice(price) ? price : null;
  } catch {
    return null;
  }
};

// ─── Source 3: CoinGecko (free, no key needed) ───

const geckoIds = {
  BTCUSDT: "bitcoin",
  ETHUSDT: "ethereum",
  BNBUSDT: "binancecoin",
  SOLUSDT: "solana",
  XRPUSDT: "ripple",
  DOGEUSDT: "dogecoin",
  ADAUSDT: "cardano",
  AVAXUSDT: "avalanche-2",
};

const fetchFromCoinGecko = async (symbol) => {
  const id = geckoIds[symbol];
  if (!id) return null;
  try {
    const res = await fetchWithTimeout(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const price = data[id]?.usd;
    return isValidPrice(price) ? price : null;
  } catch {
    return null;
  }
};

// ─── Source 4: CryptoCompare (free, no key needed) ───

const ccSymbols = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  BNBUSDT: "BNB",
  SOLUSDT: "SOL",
  XRPUSDT: "XRP",
  DOGEUSDT: "DOGE",
  ADAUSDT: "ADA",
  AVAXUSDT: "AVAX",
};

const fetchFromCryptoCompare = async (symbol) => {
  const fsym = ccSymbols[symbol];
  if (!fsym) return null;
  try {
    const res = await fetchWithTimeout(
      `https://min-api.cryptocompare.com/data/price?fsym=${fsym}&tsyms=USD`
    );
    if (!res.ok) return null;
    const data = await res.json();
    const price = data.USD;
    return isValidPrice(price) ? price : null;
  } catch {
    return null;
  }
};

// ─── Main Fetcher (tries all sources in order) ───

const getCurrentPrice = async (symbol) => {
  // OTC pairs — simulated locally, no external API needed
  if (symbol.includes("_OTC")) {
    return getOtcPrice(symbol);
  }

  // Try sources in order: Binance → Binance Alt → CoinGecko → CryptoCompare
  let price = await fetchFromBinance(symbol);
  if (price) {
    priceCache[symbol] = { price, time: Date.now() };
    return price;
  }

  price = await fetchFromBinanceAlt(symbol);
  if (price) {
    priceCache[symbol] = { price, time: Date.now() };
    return price;
  }

  price = await fetchFromCoinGecko(symbol);
  if (price) {
    priceCache[symbol] = { price, time: Date.now() };
    return price;
  }

  price = await fetchFromCryptoCompare(symbol);
  if (price) {
    priceCache[symbol] = { price, time: Date.now() };
    return price;
  }

  // Last resort — cached price
  const cached = priceCache[symbol];
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    console.warn(`  ↩ Using cached price for ${symbol}: $${cached.price}`);
    return cached.price;
  }

  console.error(`  ✖ All price sources failed for ${symbol}`);
  return null;
};

// ─── Batch Fetch ───

const getPrices = async (symbols) => {
  try {
    const otcSymbols = symbols.filter((s) => s.includes("_OTC"));
    const cryptoSymbols = symbols.filter((s) => !s.includes("_OTC"));
    const map = {};

    // OTC prices
    for (const s of otcSymbols) {
      const price = await getOtcPrice(s);
      if (price) map[s] = price;
    }

    // Try Binance batch first
    if (cryptoSymbols.length > 0) {
      let batchOk = false;
      try {
        const res = await fetchWithTimeout("https://api.binance.com/api/v3/ticker/price");
        if (res.ok) {
          const all = await res.json();
          if (Array.isArray(all)) {
            cryptoSymbols.forEach((s) => {
              const hit = all.find((x) => x.symbol === s);
              if (hit) {
                const p = parseFloat(hit.price);
                if (isValidPrice(p)) {
                  map[s] = p;
                  priceCache[s] = { price: p, time: Date.now() };
                }
              }
            });
            batchOk = true;
          }
        }
      } catch {
        // Batch failed, try individually
      }

      // Fetch missing symbols individually with fallbacks
      if (!batchOk || cryptoSymbols.some((s) => !map[s])) {
        for (const s of cryptoSymbols) {
          if (!map[s]) {
            const p = await getCurrentPrice(s);
            if (p) map[s] = p;
          }
        }
      }
    }

    return map;
  } catch (err) {
    console.error("Batch price fetch failed:", err.message);
    return {};
  }
};

module.exports = { getCurrentPrice, getPrices };
