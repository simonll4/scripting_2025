import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "../../../db/db.sqlite");

export async function initDB() {
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database,
  });

  await db.exec(`
    PRAGMA foreign_keys = ON;          -- Enforce FK constraints
    PRAGMA journal_mode = WAL;         -- Mejor concurrencia
    PRAGMA busy_timeout = 5000;        -- Evita SQLITE_BUSY en ráfagas
    PRAGMA synchronous = NORMAL;       -- Balance perf/durabilidad en WAL
  `);

  // DDL centralizada
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

    CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp
      ON system_metrics (timestamp);
  `);

  return db;
}

export async function getTokenRowById(db, tokenId) {
  return db.get(
    "SELECT tokenId, secretHash, scopes, expires_at, revoked FROM tokens WHERE tokenId=?",
    [tokenId]
  );
}

/**
 * Inserta una métrica del sistema en la base de datos
 */
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

/**
 * Obtiene métricas del sistema de los últimos N segundos
 */
export async function getSystemMetricsLastSeconds(db, seconds) {
  const cutoffTime = Date.now() - seconds * 1000;
  return db.all(
    `SELECT timestamp as time, cpu_percent as cpu, mem_total as memTotal, 
            mem_available as memAvailable, mem_used as memUsed, 
            mem_used_percent as memUsedPercent
     FROM system_metrics 
     WHERE timestamp >= ? 
     ORDER BY timestamp ASC`,
    [cutoffTime]
  );
}

/**
 * Limpia métricas antiguas (opcional, para evitar que la DB crezca indefinidamente)
 */
export async function cleanupOldMetrics(db, olderThanHours = 24) {
  const cutoffTime = Date.now() - olderThanHours * 60 * 60 * 1000;
  return db.run(
    "DELETE FROM system_metrics WHERE timestamp < ?",
    [cutoffTime]
  );
}
