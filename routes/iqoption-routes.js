/**
 * ════════════════════════════════════════════════════════════════
 * IQ OPTION WebSocket Integration — USE AT YOUR OWN RISK
 * ════════════════════════════════════════════════════════════════
 *
 * ⚠️  WARNING: This violates IQ Option Terms of Service
 * ⚠️  WARNING: Account/IP can be banned anytime
 * ⚠️  WARNING: Protocol changes frequently — will break
 * ⚠️  WARNING: For educational/testing only — NOT production
 *
 * Setup:
 * 1. npm install ws node-fetch@2 tough-cookie
 * 2. Add this file as routes/iqoption-routes.js
 * 3. Register in server.js: app.use('/api/iq', iqRouter)
 * 4. Login first via POST /api/iq/login with credentials
 *
 * Required:
 * - Active IQ Option account (test account, not main)
 * - Email + password for login
 * - 2FA must be DISABLED (or handle codes manually)
 * ════════════════════════════════════════════════════════════════
 */

const express = require('express');
const WebSocket = require('ws');
const fetch = require('node-fetch');
const router = express.Router();

// ═══════════════════════════════════════════════════════════════
// State Management
// ═══════════════════════════════════════════════════════════════
let iqState = {
  ssid: null,        // Session cookie from IQ Option
  ws: null,          // Active WebSocket connection
  connected: false,
  subscriptions: new Map(), // active_id → callback
  lastPrices: new Map(),    // symbol → { price, timestamp }
  reconnectTimer: null,
  msgId: 1,
  authenticated: false,
};

// IQ Option Active IDs (their internal asset IDs)
const ACTIVE_IDS = {
  // Forex pairs
  'EURUSD': 1,
  'GBPUSD': 2,
  'EURJPY': 3,
  'NZDUSD': 4,
  'USDRUB': 5,
  'AUDCAD': 6,
  'USDCAD': 7,
  'EURGBP': 8,
  'AUDUSD': 9,
  'USDJPY': 10,
  'GBPJPY': 11,
  'EURRUB': 12,
  'USDCHF': 13,
  'GBPCHF': 14,
  'GBPCAD': 15,
  'EURAUD': 16,
  'EURCAD': 17,
  'EURNZD': 18,
  'NZDJPY': 19,
  'NZDCHF': 20,
  'GBPAUD': 21,
  'GBPNZD': 22,
  'AUDCHF': 23,
  'AUDJPY': 24,
  'AUDNZD': 25,
  'CADCHF': 26,
  'CADJPY': 27,
  'CHFJPY': 28,
  // Stocks
  'AAPL': 100,
  'GOOGL': 101,
  'MSFT': 102,
  'AMZN': 103,
  'TSLA': 104,
  'FB': 105,
  // Crypto
  'BTCUSD': 169,
  'ETHUSD': 170,
};

const REVERSE_IDS = Object.fromEntries(
  Object.entries(ACTIVE_IDS).map(([k, v]) => [v, k])
);

// ═══════════════════════════════════════════════════════════════
// Login to IQ Option (get SSID cookie)
// ═══════════════════════════════════════════════════════════════
async function loginIQ(email, password) {
  try {
    const res = await fetch('https://auth.iqoption.com/api/v2/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: email,
        password: password,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Login failed: ${error}`);
    }

    const data = await res.json();
    const cookies = res.headers.raw()['set-cookie'] || [];
    const ssidCookie = cookies.find(c => c.startsWith('ssid='));
    
    if (!ssidCookie) {
      throw new Error('No SSID cookie received');
    }

    const ssid = ssidCookie.split(';')[0].split('=')[1];
    iqState.ssid = ssid;
    iqState.authenticated = true;
    
    console.log('✓ IQ Option login successful');
    return { success: true, ssid };
  } catch (err) {
    console.error('✗ IQ Option login failed:', err.message);
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════
// WebSocket Connection to IQ Option
// ═══════════════════════════════════════════════════════════════
function connectIQ() {
  if (!iqState.ssid) {
    console.error('✗ Cannot connect — no SSID');
    return;
  }

  if (iqState.ws && iqState.ws.readyState === WebSocket.OPEN) {
    console.log('Already connected');
    return;
  }

  console.log('Connecting to IQ Option WebSocket...');
  
  iqState.ws = new WebSocket('wss://iqoption.com/echo/websocket', {
    headers: {
      'Cookie': `ssid=${iqState.ssid}`,
      'Origin': 'https://iqoption.com',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
    }
  });

  iqState.ws.on('open', () => {
    console.log('✓ IQ Option WebSocket connected');
    iqState.connected = true;
    
    // Authenticate WebSocket
    sendMessage({
      name: 'ssid',
      msg: iqState.ssid,
    });

    // Subscribe to existing subscriptions
    for (const [activeId] of iqState.subscriptions) {
      subscribeToActive(activeId);
    }
  });

  iqState.ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(msg);
    } catch (e) {
      console.error('Parse error:', e.message);
    }
  });

  iqState.ws.on('error', (err) => {
    console.error('IQ WebSocket error:', err.message);
  });

  iqState.ws.on('close', () => {
    console.log('IQ WebSocket closed');
    iqState.connected = false;
    
    // Auto-reconnect after 5s
    if (iqState.reconnectTimer) clearTimeout(iqState.reconnectTimer);
    iqState.reconnectTimer = setTimeout(() => {
      console.log('Reconnecting...');
      connectIQ();
    }, 5000);
  });
}

function sendMessage(msg) {
  if (iqState.ws && iqState.ws.readyState === WebSocket.OPEN) {
    iqState.msgId++;
    const fullMsg = {
      ...msg,
      request_id: String(iqState.msgId),
    };
    iqState.ws.send(JSON.stringify(fullMsg));
  }
}

function subscribeToActive(activeId) {
  // Subscribe to candle updates (1 second)
  sendMessage({
    name: 'subscribeMessage',
    msg: {
      name: 'candle-generated',
      params: {
        routingFilters: {
          active_id: activeId,
          size: 1, // 1-second candles
        },
      },
    },
  });
}

function unsubscribeFromActive(activeId) {
  sendMessage({
    name: 'unsubscribeMessage',
    msg: {
      name: 'candle-generated',
      params: {
        routingFilters: {
          active_id: activeId,
          size: 1,
        },
      },
    },
  });
}

function handleMessage(msg) {
  // Price update
  if (msg.name === 'candle-generated' && msg.msg) {
    const candle = msg.msg;
    const symbol = REVERSE_IDS[candle.active_id];
    if (!symbol) return;
    
    const price = candle.close;
    iqState.lastPrices.set(symbol, {
      price,
      timestamp: candle.to * 1000,
      open: candle.open,
      high: candle.max,
      low: candle.min,
      volume: candle.volume || 0,
    });
    
    // Notify subscribers
    const callback = iqState.subscriptions.get(candle.active_id);
    if (callback) callback({ symbol, price, ...candle });
  }
  
  // Authentication response
  if (msg.name === 'profile') {
    console.log('✓ Authenticated as:', msg.msg?.email);
  }
}

// ═══════════════════════════════════════════════════════════════
// Get Historical Candles (REST API)
// ═══════════════════════════════════════════════════════════════
async function getHistoricalCandles(activeId, count = 300, size = 60) {
  if (!iqState.ssid) throw new Error('Not authenticated');
  
  return new Promise((resolve, reject) => {
    const reqId = String(++iqState.msgId);
    const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
    
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.request_id === reqId && msg.name === 'candles') {
          clearTimeout(timeout);
          iqState.ws.removeListener('message', handler);
          resolve(msg.msg.candles || []);
        }
      } catch (e) {}
    };
    
    iqState.ws.on('message', handler);
    
    sendMessage({
      name: 'sendMessage',
      msg: {
        name: 'get-candles',
        version: '2.0',
        body: {
          active_id: activeId,
          size: size, // seconds
          to: Math.floor(Date.now() / 1000),
          count: count,
        },
      },
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// REST ENDPOINTS
// ═══════════════════════════════════════════════════════════════

// POST /api/iq/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password required' });
  }
  
  const result = await loginIQ(email, password);
  if (result.success) {
    connectIQ(); // Auto-connect WebSocket after login
  }
  res.json(result);
});

// GET /api/iq/status
router.get('/status', (req, res) => {
  res.json({
    authenticated: iqState.authenticated,
    connected: iqState.connected,
    activeSubscriptions: iqState.subscriptions.size,
    cachedPrices: iqState.lastPrices.size,
  });
});

// GET /api/iq/quote/:symbol
router.get('/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const activeId = ACTIVE_IDS[symbol];
  
  if (!activeId) {
    return res.status(400).json({ success: false, error: `Unknown symbol: ${symbol}` });
  }
  
  if (!iqState.connected) {
    return res.status(503).json({ success: false, error: 'IQ Option not connected. Login first.' });
  }
  
  // Subscribe if not already
  if (!iqState.subscriptions.has(activeId)) {
    iqState.subscriptions.set(activeId, null);
    subscribeToActive(activeId);
    // Wait briefly for first price
    await new Promise(r => setTimeout(r, 1500));
  }
  
  const data = iqState.lastPrices.get(symbol);
  if (data) {
    res.json({
      success: true,
      symbol,
      price: data.price,
      timestamp: data.timestamp,
      cached: true,
    });
  } else {
    res.status(504).json({ success: false, error: 'No price data yet, try again' });
  }
});

// GET /api/iq/history/:symbol?count=300&size=60
router.get('/history/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const count = parseInt(req.query.count) || 300;
  const size = parseInt(req.query.size) || 60; // 1 minute default
  
  const activeId = ACTIVE_IDS[symbol];
  if (!activeId) {
    return res.status(400).json({ success: false, error: `Unknown symbol: ${symbol}` });
  }
  
  if (!iqState.connected) {
    return res.status(503).json({ success: false, error: 'IQ Option not connected' });
  }
  
  try {
    const candles = await getHistoricalCandles(activeId, count, size);
    const formatted = candles.map(c => ({
      timestamp: c.from * 1000,
      open: c.open,
      high: c.max,
      low: c.min,
      close: c.close,
      volume: c.volume || 0,
    }));
    
    res.json({
      success: true,
      symbol,
      candles: formatted,
      count: formatted.length,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// WebSocket Bridge for Frontend
// ═══════════════════════════════════════════════════════════════
function setupIQWebSocketBridge(server) {
  const wss = new WebSocket.Server({ noServer: true });
  
  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/api/iq/stream') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws);
      });
    }
  });
  
  wss.on('connection', (ws) => {
    const subscribed = new Set();
    
    ws.on('message', (msg) => {
      try {
        const data = JSON.parse(msg.toString());
        
        if (data.action === 'subscribe' && data.symbol) {
          const symbol = data.symbol.toUpperCase();
          const activeId = ACTIVE_IDS[symbol];
          if (!activeId) return;
          
          subscribed.add(activeId);
          
          // Subscribe via main connection
          if (!iqState.subscriptions.has(activeId)) {
            subscribeToActive(activeId);
          }
          
          // Set callback to forward to this client
          iqState.subscriptions.set(activeId, (data) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                symbol: data.symbol,
                price: data.close,
                open: data.open,
                high: data.max,
                low: data.min,
                volume: data.volume,
                timestamp: data.to * 1000,
              }));
            }
          });
        }
      } catch (e) {}
    });
    
    ws.on('close', () => {
      // Cleanup subscriptions for this client
      for (const activeId of subscribed) {
        // Note: keep main subscription alive if other clients use it
      }
    });
  });
  
  return wss;
}

module.exports = router;
module.exports.setupIQWebSocketBridge = setupIQWebSocketBridge;
module.exports.connectIQ = connectIQ;
module.exports.loginIQ = loginIQ;
