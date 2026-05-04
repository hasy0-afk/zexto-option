// api.js — API helper for Zexto Option frontend
// Place this file in your frontend src/ folder next to App.jsx

const API_URL = "http://localhost:5000/api";

// Token management
const getToken = () => localStorage.getItem("qt_token");
const setToken = (t) => localStorage.setItem("qt_token", t);
const clearToken = () => localStorage.removeItem("qt_token");

// Request helper with automatic JWT injection
async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token && { Authorization: `Bearer ${token}` }),
    ...options.headers,
  };

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    const data = await res.json();

    if (!res.ok) {
      // Auto-logout on 401
      if (res.status === 401) {
        clearToken();
      }
      throw new Error(data.message || `Request failed: ${res.status}`);
    }

    return data;
  } catch (err) {
    console.error(`API ${path} error:`, err.message);
    throw err;
  }
}

// ================== AUTH ==================
export const auth = {
  register: (name, email, password) =>
    request("/auth/register", {
      method: "POST",
      body: { name, email, password },
    }).then((d) => {
      if (d.token) setToken(d.token);
      return d;
    }),

  login: (email, password) =>
    request("/auth/login", {
      method: "POST",
      body: { email, password },
    }).then((d) => {
      if (d.token) setToken(d.token);
      return d;
    }),

  me: () => request("/auth/me"),

  updateSettings: (settings) =>
    request("/auth/settings", { method: "PUT", body: settings }),

  resetDemo: () => request("/auth/reset-demo", { method: "POST" }),

  logout: () => clearToken(),

  isAuthenticated: () => !!getToken(),
};

// ================== TRADES ==================
export const trades = {
  open: (trade) => request("/trades/open", { method: "POST", body: trade }),

  resolve: (id) => request(`/trades/resolve/${id}`, { method: "POST" }),

  active: () => request("/trades/active"),

  history: (limit = 50) => request(`/trades/history?limit=${limit}`),

  stats: () => request("/trades/stats"),
};

// ================== ALERTS ==================
export const alerts = {
  list: () => request("/alerts"),

  create: (alert) => request("/alerts", { method: "POST", body: alert }),

  delete: (id) => request(`/alerts/${id}`, { method: "DELETE" }),
};

// ================== LEADERBOARD ==================
export const leaderboard = {
  get: (period = "all", limit = 50) =>
    request(`/leaderboard?period=${period}&limit=${limit}`),
};

// ================== TOURNAMENTS ==================
export const tournaments = {
  list: () => request("/tournaments"),

  join: (id) => request(`/tournaments/${id}/join`, { method: "POST" }),

  leaderboard: (id) => request(`/tournaments/${id}/leaderboard`),
};

// ================== SIGNALS ==================
export const signals = {
  list: (limit = 20) => request(`/signals?limit=${limit}`),
};

// ================== PAIRS ==================
export const pairs = {
  list: () => request("/pairs"),
};

// Default export — all APIs bundled
export default {
  auth,
  trades,
  alerts,
  leaderboard,
  tournaments,
  signals,
  pairs,
  API_URL,
  getToken,
  setToken,
  clearToken,
};
forex: {
  quote: (symbol) => fetch(`/api/forex/quote/${symbol}`).then(r => r.json()),
  history: (symbol, tf, count) => fetch(`/api/forex/history/${symbol}?timeframe=${tf}&count=${count}`).then(r => r.json())
}