/**
 * ═══════════════════════════════════════════════════════════════
 * TradingView Real Forex Integration for ZextoOption Backend
 * ═══════════════════════════════════════════════════════════════
 *
 * Setup Instructions:
 * 1. Install: npm install @mathieuc/tradingview ws
 * 2. Add this file to your backend (e.g., routes/forex.js)
 * 3. In your main app.js/server.js: app.use('/api/forex', require('./routes/forex'))
 * 4. Frontend calls: GET /api/forex/quote/:symbol or WebSocket /api/forex/stream
 *
 * Available endpoints:
 * - GET  /api/forex/quote/:symbol      → Single price (e.g. EURUSD)
 * - GET  /api/forex/history/:symbol    → Historical candles
 * - WSS  /api/forex/stream             → Real-time price stream
 *
 * Symbol format: EURUSD, GBPUSD, USDJPY, AUDUSD, USDCAD, etc.
 * ═══════════════════════════════════════════════════════════════
 */

const express = require('express');
const TradingView = require('@mathieuc/tradingview');
const router = express.Router();

// ═══════════════════════════════════════════════════════════════
// In-memory cache (avoid hitting TradingView rate limits)
// ═══════════════════════════════════════════════════════════════
const priceCache = new Map();      // symbol → { price, timestamp }
const historyCache = new Map();    // symbol_tf → { candles, timestamp }
const CACHE_TTL = 500;             // 500ms for live prices (matches frontend polling)
const HISTORY_CACHE_TTL = 60000;   // 60 seconds for historical data

// Active TradingView clients (one per symbol for live streaming)
const activeClients = new Map();

// ═══════════════════════════════════════════════════════════════
// Helper: Convert symbol format (EURUSD → FX:EURUSD)
// ═══════════════════════════════════════════════════════════════
function formatSymbol(symbol) {
  // Remove slashes/spaces, uppercase
  const clean = symbol.replace(/[\/\s_-]/g, '').toUpperCase();
  
  // Commodities (OANDA gives best forex/metal data)
  const commodityMap = {
    'XAUUSD': 'OANDA:XAUUSD',  // Gold
    'GOLD': 'OANDA:XAUUSD',
    'XAGUSD': 'OANDA:XAGUSD',  // Silver
    'SILVER': 'OANDA:XAGUSD',
    'XPTUSD': 'TVC:PLATINUM',  // Platinum
    'XPDUSD': 'TVC:PALLADIUM', // Palladium
  };
  if (commodityMap[clean]) return commodityMap[clean];
  
  // Forex pairs (6 chars, all letters)
  if (/^[A-Z]{6}$/.test(clean)) {
    return `FX:${clean}`;
  }
  
  // Crypto (Binance)
  if (clean.endsWith('USDT') || clean.endsWith('BUSD')) {
    return `BINANCE:${clean}`;
  }
  
  // Indices
  const indexMap = {
    'SPX500': 'OANDA:SPX500USD',
    'NAS100': 'OANDA:NAS100USD',
    'US30': 'OANDA:US30USD',
    'GER40': 'OANDA:DE30EUR',
    'UK100': 'OANDA:UK100GBP',
  };
  if (indexMap[clean]) return indexMap[clean];
  
  return `FX:${clean}`;
}

// ═══════════════════════════════════════════════════════════════
// GET /api/forex/quote/:symbol
// Returns current price for a single symbol
// Example: GET /api/forex/quote/EURUSD
// ═══════════════════════════════════════════════════════════════
router.get('/quote/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const formattedSymbol = formatSymbol(symbol);
  
  // Check cache first
  const cached = priceCache.get(formattedSymbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.json({
      success: true,
      symbol: symbol,
      price: cached.price,
      cached: true,
      timestamp: cached.timestamp
    });
  }
  
  let resolved = false;
  const timeout = setTimeout(() => {
    if (!resolved) {
      resolved = true;
      res.status(504).json({ success: false, error: 'Timeout' });
    }
  }, 8000);
  
  try {
    const client = new TradingView.Client();
    const chart = new client.Session.Chart();
    
    chart.setMarket(formattedSymbol, { timeframe: '1' });
    
    chart.onError((err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        client.end();
        res.status(500).json({ success: false, error: err.toString() });
      }
    });
    
    chart.onUpdate(() => {
      if (!resolved && chart.periods && chart.periods[0]) {
        resolved = true;
        clearTimeout(timeout);
        const price = chart.periods[0].close;
        
        // Update cache
        priceCache.set(formattedSymbol, {
          price: price,
          timestamp: Date.now()
        });
        
        res.json({
          success: true,
          symbol: symbol,
          price: price,
          cached: false,
          timestamp: Date.now(),
          info: {
            description: chart.infos.description,
            currency: chart.infos.currency_id
          }
        });
        
        // Close after response
        setTimeout(() => client.end(), 100);
      }
    });
  } catch (err) {
    if (!resolved) {
      resolved = true;
      clearTimeout(timeout);
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/forex/history/:symbol?timeframe=1&count=300
// Returns historical candles
// Timeframes: 1, 3, 5, 15, 30, 60, 240, D, W
// ═══════════════════════════════════════════════════════════════
router.get('/history/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const timeframe = req.query.timeframe || '1';
  const count = parseInt(req.query.count) || 300;
  
  const formattedSymbol = formatSymbol(symbol);
  const cacheKey = `${formattedSymbol}_${timeframe}_${count}`;
  
  // Check cache
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < HISTORY_CACHE_TTL) {
    return res.json({
      success: true,
      symbol: symbol,
      timeframe: timeframe,
      candles: cached.candles,
      cached: true
    });
  }
  
  let resolved = false;
  const timeout = setTimeout(() => {
    if (!resolved) {
      resolved = true;
      res.status(504).json({ success: false, error: 'Timeout' });
    }
  }, 15000);
  
  try {
    const client = new TradingView.Client();
    const chart = new client.Session.Chart();
    
    chart.setMarket(formattedSymbol, { timeframe: timeframe, range: count });
    
    chart.onError((err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        client.end();
        res.status(500).json({ success: false, error: err.toString() });
      }
    });
    
    chart.onUpdate(() => {
      if (!resolved && chart.periods && chart.periods.length > 0) {
        resolved = true;
        clearTimeout(timeout);
        
        // Convert to standard format
        const candles = chart.periods.map(p => ({
          timestamp: p.time * 1000,  // Convert to milliseconds
          open: p.open,
          high: p.max,
          low: p.min,
          close: p.close,
          volume: p.volume || 0
        })).reverse();  // Oldest first
        
        // Cache result
        historyCache.set(cacheKey, {
          candles: candles,
          timestamp: Date.now()
        });
        
        res.json({
          success: true,
          symbol: symbol,
          timeframe: timeframe,
          candles: candles,
          count: candles.length,
          cached: false,
          info: {
            description: chart.infos.description,
            currency: chart.infos.currency_id
          }
        });
        
        setTimeout(() => client.end(), 100);
      }
    });
  } catch (err) {
    if (!resolved) {
      resolved = true;
      clearTimeout(timeout);
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// GET /api/forex/multi?symbols=EURUSD,GBPUSD,USDJPY
// Returns multiple prices in one call
// ═══════════════════════════════════════════════════════════════
router.get('/multi', async (req, res) => {
  const symbols = (req.query.symbols || '').split(',').filter(Boolean);
  
  if (symbols.length === 0) {
    return res.status(400).json({ success: false, error: 'No symbols provided' });
  }
  if (symbols.length > 10) {
    return res.status(400).json({ success: false, error: 'Max 10 symbols' });
  }
  
  const results = {};
  
  // Fetch all in parallel
  await Promise.all(symbols.map(symbol => {
    return new Promise((resolve) => {
      const formatted = formatSymbol(symbol);
      
      // Check cache
      const cached = priceCache.get(formatted);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        results[symbol] = { price: cached.price, cached: true };
        return resolve();
      }
      
      let resolved = false;
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          results[symbol] = { error: 'timeout' };
          resolve();
        }
      }, 8000);
      
      try {
        const client = new TradingView.Client();
        const chart = new client.Session.Chart();
        chart.setMarket(formatted, { timeframe: '1' });
        
        chart.onError(() => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            client.end();
            results[symbol] = { error: 'fetch_failed' };
            resolve();
          }
        });
        
        chart.onUpdate(() => {
          if (!resolved && chart.periods && chart.periods[0]) {
            resolved = true;
            clearTimeout(timer);
            const price = chart.periods[0].close;
            priceCache.set(formatted, { price, timestamp: Date.now() });
            results[symbol] = { price, cached: false };
            setTimeout(() => client.end(), 100);
            resolve();
          }
        });
      } catch (err) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          results[symbol] = { error: err.message };
          resolve();
        }
      }
    });
  }));
  
  res.json({ success: true, prices: results, timestamp: Date.now() });
});

// ═══════════════════════════════════════════════════════════════
// WebSocket Stream for real-time price updates
// Connect from frontend: new WebSocket('wss://yourapi.com/api/forex/stream')
// Send: { action: 'subscribe', symbol: 'EURUSD' }
// Receive: { symbol: 'EURUSD', price: 1.0854, timestamp: ... }
// ═══════════════════════════════════════════════════════════════
function setupWebSocketServer(server) {
  const WebSocket = require('ws');
  const wss = new WebSocket.Server({ noServer: true });
  
  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/api/forex/stream') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });
  
  wss.on('connection', (ws) => {
    const subscriptions = new Map(); // symbol → { client, chart }
    
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        
        if (data.action === 'subscribe' && data.symbol) {
          const formatted = formatSymbol(data.symbol);
          
          // Already subscribed?
          if (subscriptions.has(formatted)) return;
          
          const client = new TradingView.Client();
          const chart = new client.Session.Chart();
          chart.setMarket(formatted, { timeframe: '1' });
          
          chart.onUpdate(() => {
            if (chart.periods && chart.periods[0] && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                symbol: data.symbol,
                price: chart.periods[0].close,
                high: chart.periods[0].max,
                low: chart.periods[0].min,
                open: chart.periods[0].open,
                volume: chart.periods[0].volume,
                timestamp: Date.now()
              }));
              
              // Update cache too
              priceCache.set(formatted, {
                price: chart.periods[0].close,
                timestamp: Date.now()
              });
            }
          });
          
          chart.onError((err) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ error: err.toString(), symbol: data.symbol }));
            }
          });
          
          subscriptions.set(formatted, { client, chart });
        }
        
        if (data.action === 'unsubscribe' && data.symbol) {
          const formatted = formatSymbol(data.symbol);
          const sub = subscriptions.get(formatted);
          if (sub) {
            sub.client.end();
            subscriptions.delete(formatted);
          }
        }
      } catch (err) {
        // Invalid message, ignore
      }
    });
    
    ws.on('close', () => {
      // Clean up all subscriptions
      subscriptions.forEach(sub => sub.client.end());
      subscriptions.clear();
    });
  });
  
  return wss;
}

// Cleanup old cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of priceCache.entries()) {
    if (now - value.timestamp > 30000) priceCache.delete(key);
  }
  for (const [key, value] of historyCache.entries()) {
    if (now - value.timestamp > 600000) historyCache.delete(key);
  }
}, 60000);

module.exports = router;
module.exports.setupWebSocketServer = setupWebSocketServer;
