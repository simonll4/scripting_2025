// Capa DAO centralizada para SQLite
// - initDB(): apertura, PRAGMAs y DDL
// - Tokens: getTokenRowById
// - Watches: insertWatch, updateWatchStatus, getWatchMeta, getActiveWatches
// - Watch events (paginación keyset) y batch insert: insertWatchEventsBatch, getWatchEventsPage
// - Métricas del sistema: insertSystemMetric, getSystemMetricsLastSeconds, cleanupOldMetrics

import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";

// ------------------------------------------------------------
// Paths / Constantes
// ------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../../../db/db.sqlite");

// ------------------------------------------------------------
// Inicialización DB (PRAGMAs + DDL)
// ------------------------------------------------------------
export async function initDB() {
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  // PRAGMAs recomendados para servicio con concurrencia moderada
  await db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
  `);

  // DDL centralizado
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      tokenId TEXT PRIMARY KEY,
      secretHash TEXT NOT NULL,
      scopes TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      revoked INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS watches (
      token TEXT PRIMARY KEY,
      abs_path TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('active','stopped','expired'))
    );

    CREATE TABLE IF NOT EXISTS watch_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      event_type TEXT NOT NULL,
      file_path TEXT,
      ts INTEGER NOT NULL,
      FOREIGN KEY(token) REFERENCES watches(token) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS system_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      cpu_percent REAL NOT NULL,
      mem_total INTEGER NOT NULL,
      mem_available INTEGER NOT NULL,
      mem_used INTEGER NOT NULL,
      mem_used_percent REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_watches_status_expires
      ON watches (status, expires_at);

    CREATE INDEX IF NOT EXISTS idx_watch_events_token_ts
      ON watch_events (token, ts);

    -- Índice compuesto recomendado para keyset ordenado y estable
    CREATE INDEX IF NOT EXISTS idx_watch_events_token_ts_id
      ON watch_events (token, ts, id);

    CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp
      ON system_metrics (timestamp);
  `);

  return db;
}

// ------------------------------------------------------------
// DAO: Tokens
// ------------------------------------------------------------
export async function getTokenRowById(db, tokenId) {
  return db.get(
    `SELECT tokenId, secretHash, scopes, expires_at, revoked
     FROM tokens
     WHERE tokenId = ?`,
    [tokenId]
  );
}

// ------------------------------------------------------------
// DAO: Watches
// ------------------------------------------------------------
export async function insertWatch(
  db,
  { token, absPath, startedAt, expiresAt }
) {
  await db.run(
    `INSERT INTO watches (token, abs_path, started_at, expires_at, status)
     VALUES (?, ?, ?, ?, 'active')`,
    [token, absPath, startedAt, expiresAt]
  );
}

export async function updateWatchStatus(db, token, status, nowTs = Date.now()) {
  // idempotente: si ya no está 'active' no se pisa; también actualiza expires_at mínimo
  await db.run(
    `UPDATE watches
       SET status = ?, expires_at = MAX(expires_at, ?)
     WHERE token = ? AND status = 'active'`,
    [status, nowTs, token]
  );
}

export async function getWatchMeta(db, token) {
  return db.get(
    `SELECT token, abs_path, started_at, expires_at, status
     FROM watches
     WHERE token = ?`,
    [token]
  );
}

export async function getActiveWatches(db, nowTs = Date.now()) {
  return db.all(
    `SELECT token, abs_path, started_at, expires_at
       FROM watches
      WHERE status = 'active' AND expires_at > ?`,
    [nowTs]
  );
}

// ------------------------------------------------------------
// DAO: Watch Events
// ------------------------------------------------------------
/**
 * Inserta un lote de eventos en una transacción con prepared statement.
 * @param {import("sqlite").Database} db
 * @param {string} token
 * @param {Array<{event_type:string,file_path:string|null,ts:number}>} events
 */
export async function insertWatchEventsBatch(db, token, events) {
  if (!events?.length) return;

  const stmt = await db.prepare(
    `INSERT INTO watch_events (token, event_type, file_path, ts)
     VALUES (?, ?, ?, ?)`
  );

  try {
    await db.exec("BEGIN");
    for (const e of events) {
      await stmt.run(token, e.event_type, e.file_path ?? null, e.ts);
    }
    await db.exec("COMMIT");
  } catch (err) {
    try {
      await db.exec("ROLLBACK");
    } catch (_) {}
    throw err;
  } finally {
    try {
      await stmt.finalize();
    } catch (_) {}
  }
}

/**
 * Paginación keyset (asc/desc) por (ts, id) para estabilidad.
 */
export async function getWatchEventsPage(
  db,
  {
    token,
    since = undefined,
    until = undefined,
    limit = 1000,
    order = "asc",
    afterTs = undefined,
    afterId = undefined,
  }
) {
  const where = ["token = ?"];
  const params = [token];

  if (typeof since === "number") {
    where.push("ts >= ?");
    params.push(since);
  }
  if (typeof until === "number") {
    where.push("ts <= ?");
    params.push(until);
  }

  if (
    order === "asc" &&
    typeof afterTs === "number" &&
    typeof afterId === "number"
  ) {
    where.push("(ts > ? OR (ts = ? AND id > ?))");
    params.push(afterTs, afterTs, afterId);
  } else if (
    order === "desc" &&
    typeof afterTs === "number" &&
    typeof afterId === "number"
  ) {
    where.push("(ts < ? OR (ts = ? AND id < ?))");
    params.push(afterTs, afterTs, afterId);
  }

  const orderBy =
    order === "desc" ? "ORDER BY ts DESC, id DESC" : "ORDER BY ts ASC, id ASC";

  const sql = `
    SELECT id, event_type, file_path, ts
      FROM watch_events
     WHERE ${where.join(" AND ")}
     ${orderBy}
     LIMIT ?
  `;
  params.push(Math.max(1, limit) + 1);

  return db.all(sql, params);
}

// ------------------------------------------------------------
// DAO: Métricas del sistema
// ------------------------------------------------------------
export async function insertSystemMetric(db, metric) {
  return db.run(
    `INSERT INTO system_metrics
       (timestamp, cpu_percent, mem_total, mem_available, mem_used, mem_used_percent)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      metric.time,
      metric.cpu,
      metric.memTotal,
      metric.memAvailable,
      metric.memUsed,
      metric.memUsedPercent,
    ]
  );
}

export async function getSystemMetricsLastSeconds(db, seconds) {
  const cutoffTime = Date.now() - seconds * 1000;
  return db.all(
    `SELECT timestamp AS time,
            cpu_percent AS cpu,
            mem_total AS memTotal,
            mem_available AS memAvailable,
            mem_used AS memUsed,
            mem_used_percent AS memUsedPercent
       FROM system_metrics
      WHERE timestamp >= ?
      ORDER BY timestamp ASC`,
    [cutoffTime]
  );
}

export async function cleanupOldMetrics(db, olderThanHours = 24) {
  const cutoffTime = Date.now() - olderThanHours * 60 * 60 * 1000;
  return db.run(`DELETE FROM system_metrics WHERE timestamp < ?`, [cutoffTime]);
}
