import { Router } from "express";
import { hashPassword, comparePassword, generateToken, authMiddleware } from "./auth.js";
import * as db from "./db.js";

const router = Router();
const CAT_NAME = (process.env.CAT_NAME || "Basil").toLowerCase().trim();

function stripPassword(user) {
  if (!user) return user;
  const { password_hash, ...rest } = user;
  return rest;
}

// ─── Public ──────────────────────────────────────────────────────────────────

router.post("/register", (req, res) => {
  const { username, displayName, password, avatar, catName } = req.body;

  if (!username || !displayName || !password || !catName) {
    return res.status(400).json({ error: "All fields are required" });
  }
  if (catName.toLowerCase().trim() !== CAT_NAME) {
    return res.status(403).json({ error: "Wrong answer! You must know the cat's name to join." });
  }
  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: "Username must be 2-20 characters" });
  }
  if (!/^[a-z0-9_-]+$/.test(username.toLowerCase())) {
    return res.status(400).json({ error: "Username: letters, numbers, hyphens, underscores only" });
  }
  if (password.length < 3) {
    return res.status(400).json({ error: "Password must be at least 3 characters" });
  }

  const existing = db.getUserByUsername(username.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: "Username already taken" });
  }

  const hash = hashPassword(password);
  const user = db.createUser(username.toLowerCase().trim(), displayName.trim(), hash, avatar || "👤");
  const token = generateToken(user.id);
  res.json({ token, user: stripPassword(user) });
});

router.post("/login", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  const user = db.getUserByUsername(username.toLowerCase().trim());
  if (!user || user.type === "proxy") {
    return res.status(401).json({ error: "Invalid username or password" });
  }
  if (!comparePassword(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const token = generateToken(user.id);
  res.json({ token, user: stripPassword(user) });
});

// ─── Authenticated ───────────────────────────────────────────────────────────

router.use(authMiddleware);

router.get("/me", (req, res) => {
  const user = db.getUserById(req.userId);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: stripPassword(user) });
});

router.get("/users", (_req, res) => {
  res.json({ users: db.getAllUsers() });
});

router.get("/txns", (_req, res) => {
  res.json({ txns: db.getAllTxns() });
});

router.post("/txns", (req, res) => {
  const { toId, points, reason } = req.body;

  if (!toId || !points || typeof points !== "number") {
    return res.status(400).json({ error: "toId and points (number) are required" });
  }
  if (points === 0) {
    return res.status(400).json({ error: "Points cannot be zero" });
  }
  if (Math.abs(points) > 10) {
    return res.status(400).json({ error: "Max ±10 points per transaction" });
  }

  const target = db.getUserById(toId);
  if (!target) return res.status(404).json({ error: "Target user not found" });

  if (target.type === "user" && target.id === req.userId) {
    return res.status(400).json({ error: "Can't give points to yourself" });
  }

  if (target.type === "proxy") {
    const controllers = target.controlled_by ? JSON.parse(target.controlled_by) : [];
    if (!controllers.includes(req.userId)) {
      return res.status(403).json({ error: "You don't control this proxy account" });
    }
  }

  try {
    const { txn, updatedUser } = db.createTransaction(req.userId, toId, points, reason);
    res.json({ txn, updatedUser: stripPassword(updatedUser) });
  } catch (err) {
    if (err.message.startsWith("Daily limit")) {
      return res.status(429).json({ error: err.message });
    }
    throw err;
  }
});

router.post("/users/proxy", (req, res) => {
  const { username, displayName, avatar } = req.body;

  if (!username || !displayName) {
    return res.status(400).json({ error: "Username and display name required" });
  }
  if (!/^[a-z0-9_-]+$/.test(username.toLowerCase())) {
    return res.status(400).json({ error: "Username: letters, numbers, hyphens, underscores only" });
  }

  const existing = db.getUserByUsername(username.toLowerCase().trim());
  if (existing) {
    return res.status(409).json({ error: "Username already taken" });
  }

  const user = db.createUser(username.toLowerCase().trim(), displayName.trim(), null, avatar || "🎭", "proxy", [req.userId]);
  res.json({ user: stripPassword(user) });
});

router.get("/sync", (req, res) => {
  const since = parseInt(req.query.since) || 0;
  res.json({
    users: db.getUsersSince(since),
    txns: db.getTxnsSince(since),
    serverTime: Date.now(),
  });
});

router.get("/budget/:toId", (req, res) => {
  const toId = parseInt(req.params.toId);
  if (!toId) return res.status(400).json({ error: "Invalid target ID" });
  const used = db.getDailyPointsUsed(req.userId, toId);
  res.json({ used, remaining: Math.max(0, 10 - used) });
});

export default router;
