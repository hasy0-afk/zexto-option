# Frontend Integration Guide

Your current `App.jsx` uses `localStorage` for all data. Here's how to switch it to the backend.

## Step 1: Copy `api.js` into your frontend

Place `api.js` in `src/` folder next to `App.jsx`:

```
frontend/
├── src/
│   ├── App.jsx
│   ├── api.js        ← add this file
│   └── main.jsx
```

## Step 2: Import in App.jsx

At top of App.jsx, add:

```js
import API from "./api";
```

## Step 3: Replace key code blocks

### RegisterPage — replace the onClick of "Create Account"

**Current:**
```js
onClick={()=>{setLd(true);setTimeout(()=>{setLd(false);onLogin();},500)}}
```

**New:**
```js
onClick={async ()=>{
  setLd(true);
  try {
    if (il) {
      // Sign in mode
      await API.auth.login(email, password);
    } else {
      // Register mode
      await API.auth.register(name, email, password);
    }
    onLogin();
  } catch (err) {
    alert(err.message);
  } finally {
    setLd(false);
  }
}}
```

(You'll need to wire `name`, `email`, `password` state to the input fields.)

### TradingPage — on mount, load user data

```js
useEffect(() => {
  if (!API.auth.isAuthenticated()) return;
  API.auth.me().then(d => {
    setBal(d.user.demoBalance);
    setSettings(d.user.settings);
    // Trigger stats refresh etc
  }).catch(() => {});
}, []);
```

### Open Trade — replace the current openTrade function

**Current localStorage version:**
```js
const openTrade = (dir) => {
  // ... creates trade in local state
};
```

**New backend version:**
```js
const openTrade = async (dir) => {
  if (activePair.length >= 5) return;
  try {
    const { trade, newBalance } = await API.trades.open({
      symbol: p.s,
      pair: p.short + "/USDT",
      direction: dir,
      amount: amt,
      duration: dur.sec,
      payout: p.payout,
      entry: lp,
    });
    setBal(newBalance);
    setTrades(prev => [...prev, { ...trade, id: trade._id }]);
    toast("Trade Opened", `${dir} ${p.short} $${amt}`, "success", 2000);
  } catch (err) {
    toast("Trade Failed", err.message, "error", 3000);
  }
};
```

### Load Active Trades on pair change

```js
useEffect(() => {
  if (!API.auth.isAuthenticated()) return;
  API.trades.active().then(d => {
    setTrades(d.trades.map(t => ({ ...t, id: t._id })));
  }).catch(() => {});
}, [p.s]);
```

### Trade Resolution — poll every few seconds

Your frontend already animates active lines. Backend auto-resolves expired trades.
Refresh the list periodically:

```js
useEffect(() => {
  const iv = setInterval(async () => {
    if (!API.auth.isAuthenticated()) return;
    try {
      const [{ trades: active }, { trades: history }] = await Promise.all([
        API.trades.active(),
        API.trades.history(50),
      ]);
      setTrades(active.map(t => ({ ...t, id: t._id })));
      setHistory(history.map(t => ({ ...t, id: t._id })));
      // Refresh balance too
      const me = await API.auth.me();
      setBal(me.user.demoBalance);
    } catch {}
  }, 5000);
  return () => clearInterval(iv);
}, []);
```

### Alerts — replace localStorage CRUD

**Load alerts:**
```js
useEffect(() => {
  if (!API.auth.isAuthenticated()) return;
  API.alerts.list().then(d => setAlerts(d.alerts.map(a => ({ ...a, id: a._id })))).catch(() => {});
}, []);
```

**Add alert (replace your current setAlerts calls):**
```js
const addAlert = async (alertData) => {
  try {
    const { alert } = await API.alerts.create(alertData);
    setAlerts(prev => [...prev, { ...alert, id: alert._id }]);
    toast("Alert Set", `${alert.dir} ${alert.price}`, "success", 2000);
  } catch (err) {
    toast("Alert Failed", err.message, "error", 3000);
  }
};

const removeAlert = async (id) => {
  try {
    await API.alerts.delete(id);
    setAlerts(prev => prev.filter(a => a.id !== id));
  } catch (err) {
    console.error(err);
  }
};
```

### Settings — save to backend

In your SettingsPanel `onSave` callback:
```js
onSave={async (newSettings) => {
  try {
    await API.auth.updateSettings(newSettings);
    setSettings(newSettings);
  } catch (err) {
    toast("Settings Error", err.message, "error", 3000);
  }
}}
```

### Leaderboard — replace fake data with API call

In your `RankingPanel` component:

```js
const [leaderboard, setLeaderboard] = useState([]);
const [myRank, setMyRank] = useState(null);
const [period, setPeriod] = useState("month");

useEffect(() => {
  if (!open) return;
  API.leaderboard.get(period, 10).then(d => {
    setLeaderboard(d.leaderboard);
    setMyRank(d.myRank);
  }).catch(() => {});
}, [open, period]);
```

### Tournaments — fetch from backend

```js
const [tournaments, setTournaments] = useState([]);

useEffect(() => {
  if (!open) return;
  API.tournaments.list().then(d => setTournaments(d.tournaments)).catch(() => {});
}, [open]);

// Join button:
onClick={async () => {
  try {
    await API.tournaments.join(t.id);
    toast("Joined!", `Welcome to ${t.title}`, "success", 2500);
    // Refresh list
    const d = await API.tournaments.list();
    setTournaments(d.tournaments);
  } catch (err) {
    toast("Join Failed", err.message, "error", 3000);
  }
}}
```

### Signals — fetch from backend

```js
useEffect(() => {
  const iv = setInterval(() => {
    if (!API.auth.isAuthenticated()) return;
    API.signals.list(20).then(d => {
      setSignals(d.signals);
    }).catch(() => {});
  }, 15000); // every 15s
  return () => clearInterval(iv);
}, []);
```

### Logout

Add a logout button or in the settings:
```js
<button onClick={() => { API.auth.logout(); window.location.reload(); }}>
  Logout
</button>
```

---

## Testing Flow

1. Start MongoDB (should already be running as Windows service)
2. Start backend: `cd backend && npm run dev`
3. Start frontend: `cd quantum-trade && npm run dev`
4. Open http://localhost:5173
5. Register a new account (e.g. test@test.com / password123)
6. You'll get a JWT token stored in localStorage
7. Trade, and watch trades auto-resolve after expiry
8. Check leaderboard — you should appear after making trades
9. Join a tournament

---

## Common Issues

**"Network Error" / CORS:**
- Make sure backend is running on port 5000
- Check `CLIENT_URL` in backend `.env` matches your frontend (default `http://localhost:5173`)

**"Invalid token":**
- Token expired — logout and login again

**Trades not settling:**
- Backend's `tradeResolver` job runs every 5 seconds
- Check backend console — should show "✅ Trade xxx: WON/LOST" messages
