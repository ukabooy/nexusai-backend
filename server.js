require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const https = require("https");

const app = express();
const users = [];
const JWT_SECRET = process.env.JWT_SECRET || "nexusai_secret_2026";

app.use(helmet());
app.use(cors({ origin: "*", credentials: true }));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));
app.use(express.json({ limit: "10kb" }));
app.use(morgan("combined"));

// ── Health ───────────────────────────────────────────────────
app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", message: "NexusAI backend running!", timestamp: new Date().toISOString() })
);

// ── Register ─────────────────────────────────────────────────
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, username, fullName } = req.body;
    if (!email || !password || !username)
      return res.status(400).json({ error: "Email, password and username are required" });
    if (password.length < 8)
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    if (users.find(u => u.email === email))
      return res.status(409).json({ error: "Email already registered" });
    const hashed = await bcrypt.hash(password, 12);
    const user = { id: crypto.randomUUID(), email, username, fullName, password: hashed, plan: "free", role: "user", createdAt: new Date().toISOString() };
    users.push(user);
    res.status(201).json({ message: "Registration successful! You can now login.", userId: user.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Login ────────────────────────────────────────────────────
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email);
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user.id, email: user.email, username: user.username, fullName: user.fullName, plan: user.plan, role: user.role } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Me ───────────────────────────────────────────────────────
app.get("/api/auth/me", (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "No token" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = users.find(u => u.id === decoded.id);
    if (!user) return res.status(404).json({ error: "User not found" });
    const { password, ...safe } = user;
    res.json({ user: safe });
  } catch (err) { res.status(401).json({ error: "Invalid token" }); }
});

// ── Live Prices (proxied from Binance) ───────────────────────
app.get("/api/markets/prices", (_req, res) => {
  const symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"];
  const names = { BTCUSDT: "BTC/USD", ETHUSDT: "ETH/USD", SOLUSDT: "SOL/USD", BNBUSDT: "BNB/USD" };
  const results = [];
  let completed = 0;

  symbols.forEach(symbol => {
    https.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, (response) => {
      let data = "";
      response.on("data", chunk => data += chunk);
      response.on("end", () => {
        try {
          const t = JSON.parse(data);
          results.push({
            symbol: names[symbol],
            price: parseFloat(t.lastPrice),
            change: parseFloat(t.priceChangePercent),
            high: parseFloat(t.highPrice),
            low: parseFloat(t.lowPrice),
          });
        } catch(e) {}
        completed++;
        if (completed === symbols.length) {
          res.json({ prices: results });
        }
      });
    }).on("error", () => {
      completed++;
      if (completed === symbols.length) res.json({ prices: results });
    });
  });
});

// ── Signals ──────────────────────────────────────────────────
app.get("/api/signals", (_req, res) => {
  res.json({ signals: [
    { id: 1, symbol: "BTC/USD", direction: "BUY", entryPrice: 67420, stopLoss: 66800, takeProfit: 68800, confidence: 91, riskReward: 2.3, status: "active" },
    { id: 2, symbol: "EUR/USD", direction: "SELL", entryPrice: 1.0865, stopLoss: 1.0895, takeProfit: 1.0805, confidence: 84, riskReward: 2.0, status: "active" },
    { id: 3, symbol: "XAU/USD", direction: "BUY", entryPrice: 2310, stopLoss: 2290, takeProfit: 2360, confidence: 88, riskReward: 2.5, status: "active" },
    { id: 4, symbol: "ETH/USD", direction: "BUY", entryPrice: 3380, stopLoss: 3310, takeProfit: 3520, confidence: 79, riskReward: 2.0, status: "active" },
    { id: 5, symbol: "GBP/USD", direction: "SELL", entryPrice: 1.2680, stopLoss: 1.2715, takeProfit: 1.2610, confidence: 82, riskReward: 2.0, status: "active" },
  ]});
});

// ── Trades ───────────────────────────────────────────────────
app.get("/api/trades", (_req, res) => {
  res.json({ trades: [
    { id: 1, symbol: "BTC/USD", direction: "BUY", entryPrice: 67420, exitPrice: 67842, pnl: 422, status: "closed" },
    { id: 2, symbol: "EUR/USD", direction: "SELL", entryPrice: 1.0865, exitPrice: 1.0842, pnl: 230, status: "closed" },
    { id: 3, symbol: "XAU/USD", direction: "BUY", entryPrice: 2310, exitPrice: null, pnl: 84, status: "open" },
  ]});
});

app.use((err, _req, res, _next) => {
  res.status(err.statusCode || 500).json({ error: err.message });
});

const PORT = process.env.PORT || 7860;
app.listen(PORT, () => console.log(`NexusAI backend running on port ${PORT}`));

module.exports = app;
