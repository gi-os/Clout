import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dbPath = process.env.DB_PATH || "./data/clout.db";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── Schema ──────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT,
    avatar TEXT DEFAULT '👤',
    score INTEGER DEFAULT 0,
    type TEXT DEFAULT 'user',
    controlled_by TEXT,
    created_at INTEGER DEFAULT (unixepoch() * 1000),
    updated_at INTEGER DEFAULT (unixepoch() * 1000)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_id INTEGER NOT NULL REFERENCES users(id),
    to_id INTEGER NOT NULL REFERENCES users(id),
    points INTEGER NOT NULL,
    reason TEXT,
    created_at INTEGER DEFAULT (unixepoch() * 1000)
  );

  CREATE INDEX IF NOT EXISTS idx_txn_created ON transactions(created_at);
  CREATE INDEX IF NOT EXISTS idx_txn_from_to ON transactions(from_id, to_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_users_updated ON users(updated_at);
`);

// ─── Queries ─────────────────────────────────────────────────────────────────

export function createUser(username, displayName, passwordHash, avatar, type = "user", controlledBy = null) {
  const now = Date.now();
  const stmt = db.prepare(`
    INSERT INTO users (username, display_name, password_hash, avatar, type, controlled_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(username, displayName, passwordHash, avatar, type, controlledBy ? JSON.stringify(controlledBy) : null, now, now);
  return getUserById(result.lastInsertRowid);
}

export function getUserByUsername(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username);
}

export function getUserById(id) {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
}

export function getAllUsers() {
  return db.prepare("SELECT id, username, display_name, avatar, score, type, controlled_by, created_at, updated_at FROM users ORDER BY score DESC").all();
}

export function getAllTxns() {
  return db.prepare("SELECT * FROM transactions ORDER BY created_at DESC").all();
}

function startOfTodayUTC() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export function getDailyPointsUsed(fromId, toId) {
  const todayStart = startOfTodayUTC();
  const row = db.prepare(`
    SELECT COALESCE(SUM(ABS(points)), 0) AS used
    FROM transactions
    WHERE from_id = ? AND to_id = ? AND created_at >= ?
  `).get(fromId, toId, todayStart);
  return row.used;
}

export const createTransaction = db.transaction((fromId, toId, points, reason) => {
  const used = getDailyPointsUsed(fromId, toId);
  const remaining = 10 - used;
  if (Math.abs(points) > remaining) {
    throw new Error(`Daily limit: you have ${remaining} points remaining for this person today`);
  }

  const now = Date.now();
  db.prepare(`
    INSERT INTO transactions (from_id, to_id, points, reason, created_at) VALUES (?, ?, ?, ?, ?)
  `).run(fromId, toId, points, reason || null, now);

  db.prepare(`UPDATE users SET score = score + ?, updated_at = ? WHERE id = ?`).run(points, now, toId);

  return {
    txn: db.prepare("SELECT * FROM transactions WHERE rowid = last_insert_rowid()").get(),
    updatedUser: getUserById(toId),
  };
});

export function getUsersSince(ts) {
  return db.prepare("SELECT id, username, display_name, avatar, score, type, controlled_by, created_at, updated_at FROM users WHERE updated_at > ?").all(ts);
}

export function getTxnsSince(ts) {
  return db.prepare("SELECT * FROM transactions WHERE created_at > ? ORDER BY created_at DESC").all(ts);
}

export default db;
