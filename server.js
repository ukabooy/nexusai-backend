require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  credentials: true,
}));

app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 200 }));
app.use(express.json({ limit: "10kb" }));
app.use(morgan("combined"));

app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", message: "NexusAI backend running!", timestamp: new Date().toISOString() })
);

app.use((err, _req, res, _next) => {
  res.status(err.statusCode || 500).json({ error: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`NexusAI backend running on port ${PORT}`));

module.exports = app;
