# Zexto Option Backend

Full-featured backend for Zexto Option binary trading platform — Node.js + Express + MongoDB.

## Features

- ✅ JWT Authentication (register/login)
- ✅ Demo balance system ($10,000 starting)
- ✅ Trade open/close with auto-settlement
- ✅ Price alerts (CRUD)
- ✅ Global leaderboard (Week/Month/All-time)
- ✅ Tournaments with prize distribution
- ✅ Auto-generated trading signals
- ✅ Real price data from Binance

## Setup (Local Development)

### 1. Install MongoDB

**Windows:**
- Download MongoDB Community Server: https://www.mongodb.com/try/download/community
- Install with defaults (it runs as a Windows service automatically)
- Default port: `27017`

**Verify running:**
```bash
mongosh
```
Exit with: `exit`

### 2. Install Node.js (if not already)

- Download Node.js 18+ from: https://nodejs.org/

### 3. Install dependencies

```bash
cd backend
npm install
```

### 4. Configure `.env`

File already created — default works for local dev. Change JWT_SECRET before production!

### 5. Seed sample data

```bash
npm run seed
```

Creates:
- 6 sample tournaments (2 live, 2 starting soon, 2 upcoming)
- 10 demo users for leaderboard

### 6. Start server

```bash
npm run dev
```

Server runs on: **http://localhost:5000**

### 7. Test it

Open in browser: `http://localhost:5000`

Should show API endpoints list.

---

## API Endpoints

### Auth
- `POST /api/auth/register` — `{name, email, password}`
- `POST /api/auth/login` — `{email, password}`
- `GET /api/auth/me` — Get current user (requires `Authorization: Bearer <token>`)
- `PUT /api/auth/settings` — Update settings
- `POST /api/auth/reset-demo` — Reset demo balance to $10,000

### Trades (all require auth)
- `POST /api/trades/open` — `{symbol, pair, direction, amount, duration, payout, entry}`
- `POST /api/trades/resolve/:id` — Manually resolve
- `GET /api/trades/active` — Current active trades
- `GET /api/trades/history?limit=50` — Trade history
- `GET /api/trades/stats` — User stats

### Alerts (all require auth)
- `GET /api/alerts` — All active alerts
- `POST /api/alerts` — `{pair, symbol, price, direction: "above"|"below"}`
- `DELETE /api/alerts/:id`

### Leaderboard (auth required for `myRank`)
- `GET /api/leaderboard?period=week|month|all&limit=50`

### Tournaments (auth required)
- `GET /api/tournaments` — List all live + upcoming
- `POST /api/tournaments/:id/join` — Join a tournament
- `GET /api/tournaments/:id/leaderboard`

### Signals (auth required)
- `GET /api/signals?limit=20`

---

## Background Jobs (auto-started)

- **Trade Resolver** — every 5 seconds, auto-resolves expired trades with real Binance prices
- **Signal Generator** — every 45 seconds, creates new trading signal
- **Tournament Updater** — every 60 seconds, updates tournament status + distributes prizes

---

## Folder Structure

```
backend/
├── config/
│   └── db.js                  # MongoDB connection
├── models/
│   ├── User.js                # User with balance, stats, settings
│   ├── Trade.js               # Trades
│   ├── Alert.js               # Price alerts
│   ├── Tournament.js          # Tournaments
│   └── Signal.js              # Trading signals
├── middleware/
│   ├── auth.js                # JWT protection
│   └── error.js               # Global error handler
├── controllers/
│   ├── authController.js
│   ├── tradeController.js
│   ├── alertController.js
│   ├── leaderboardController.js
│   ├── tournamentController.js
│   └── signalController.js
├── routes/
│   ├── auth.js
│   ├── trades.js
│   ├── alerts.js
│   ├── leaderboard.js
│   ├── tournaments.js
│   └── signals.js
├── jobs/
│   ├── tradeResolver.js       # Auto-settle expired trades
│   ├── signalGenerator.js     # Auto-generate signals
│   └── tournamentUpdater.js   # Update tournament status
├── utils/
│   ├── generateToken.js
│   ├── priceFetcher.js        # Binance price API
│   └── seed.js                # Sample data seeder
├── .env                       # Config
├── package.json
└── server.js                  # Entry point
```

---

## Frontend Integration

To connect your `App.jsx` to this backend:

1. Add `const API = "http://localhost:5000/api";` at the top of App.jsx
2. Replace `localStorage` calls with `fetch` calls to backend
3. Store JWT token in localStorage on login
4. Send token in every request header: `Authorization: Bearer ${token}`

See `App.jsx` for the example integration.

---

## Troubleshooting

**MongoDB connection error:**
- Make sure MongoDB service is running
- Windows: Open Services → find "MongoDB Server" → Start
- Check the URI in `.env`

**"Port 5000 already in use":**
- Change `PORT` in `.env` to `5001` or another port
- Update frontend `API` URL accordingly

**CORS errors from frontend:**
- Make sure `CLIENT_URL` in `.env` matches your frontend URL exactly
- Default is `http://localhost:5173` (Vite default)
