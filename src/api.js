// ═══════════════════════════════════════════════════════════════
// Backend API Configuration - LOCAL PC
// ═══════════════════════════════════════════════════════════════
const API_URL = "http://localhost:5000/api";

const getToken = () => localStorage.getItem("qt_token");
const setToken = (t) => localStorage.setItem("qt_token", t);
const clearToken = () => localStorage.removeItem("qt_token");

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
      if (res.status === 401) clearToken();
      throw new Error(data.message || `Request failed: ${res.status}`);
    }
    return data;
  } catch (err) {
    console.error(`API ${path} error:`, err.message);
    throw err;
  }
}

export const auth = {
  register: (name, email, password) =>
    request("/auth/register", { method: "POST", body: { name, email, password } })
      .then((d) => { if (d.token) setToken(d.token); return d; }),
  login: (email, password) =>
    request("/auth/login", { method: "POST", body: { email, password } })
      .then((d) => { if (d.token) setToken(d.token); return d; }),
  me: () => request("/auth/me"),
  updateSettings: (settings) => request("/auth/settings", { method: "PUT", body: settings }),
  resetDemo: () => request("/auth/reset-demo", { method: "POST" }),
  logout: () => clearToken(),
  isAuthenticated: () => !!getToken(),
};

export const trades = {
  open: (trade) => request("/trades/open", { method: "POST", body: trade }),
  resolve: (id) => request(`/trades/resolve/${id}`, { method: "POST" }),
  active: () => request("/trades/active"),
  history: (limit = 50) => request(`/trades/history?limit=${limit}`),
  stats: () => request("/trades/stats"),
};

export const alerts = {
  list: () => request("/alerts"),
  create: (alert) => request("/alerts", { method: "POST", body: alert }),
  delete: (id) => request(`/alerts/${id}`, { method: "DELETE" }),
};

export const leaderboard = {
  get: (period = "all", limit = 50) => request(`/leaderboard?period=${period}&limit=${limit}`),
};

export const tournaments = {
  list: () => request("/tournaments"),
  join: (id) => request(`/tournaments/${id}/join`, { method: "POST" }),
  leaderboard: (id) => request(`/tournaments/${id}/leaderboard`),
};

export const signals = {
  list: (limit = 20) => request(`/signals?limit=${limit}`),
};

export const pairs = {
  list: () => request("/pairs"),
};

export const kyc = {
  me: () => request("/kyc/me"),
  submit: (data) => request("/kyc", { method: "POST", body: data }),
};

export const support = {
  create: async (formData) => {
    const token = getToken();
    const res = await fetch(`${API_URL}/support`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    return res.json();
  },
  list: async () => {
    const token = getToken();
    const res = await fetch(`${API_URL}/support/my`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
  get: async (id) => {
    const token = getToken();
    const res = await fetch(`${API_URL}/support/${id}`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
  reply: async (id, formData) => {
    const token = getToken();
    const res = await fetch(`${API_URL}/support/${id}/reply`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    return res.json();
  },
  close: async (id) => {
    const token = getToken();
    const res = await fetch(`${API_URL}/support/${id}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
    return res.json();
  },
};

export const wallet = {
  depositAddresses: () => request("/wallet/deposit-addresses"),
  deposits: () => request("/wallet/deposits"),
  withdraw: (data) => request("/wallet/withdraw", { method: "POST", body: data }),
  withdrawals: () => request("/wallet/withdrawals"),
  summary: () => request("/wallet/summary"),
};

export const promo = {
  validate: (code, amount) => request("/promo/validate", { method: "POST", body: { code, amount } }),
  apply: (code, amount) => request("/promo/apply", { method: "POST", body: { code, amount } }),
};

export default {
  auth,
  trades,
  alerts,
  leaderboard,
  tournaments,
  signals,
  pairs,
  kyc,
  support,
  wallet,
  promo,
  API_URL,
  getToken,
  setToken,
  clearToken,
};
