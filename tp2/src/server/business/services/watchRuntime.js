import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import chokidar from "chokidar";

import {
  insertWatch,
  updateWatchStatus,
  getActiveWatches,
  insertWatchEventsBatch,
} from "../../db/db.js";

// ------------------------------------------------------------
// Config
// ------------------------------------------------------------
const BATCH_FLUSH_MS = 120;
const BATCH_MAX_SIZE = 200;

const WATCH_OPTS = Object.freeze({
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
  followSymlinks: true,
  persistent: false,
});

// token -> { watcher, timer, writer }
const ACTIVE_WATCHES = new Map();

const toErrorString = (err) => (err && err.message ? err.message : String(err));

// ------------------------------------------------------------
// EventWriter: batch -> DAO.insertWatchEventsBatch
// ------------------------------------------------------------
class EventWriter {
  /**
   * @param {import("sqlite").Database} db
   * @param {string} token
   */
  constructor(db, token) {
    this.db = db;
    this.token = token;
    this.queue = [];
    this.timer = null;
    this.closed = false;
  }

  async push(event_type, file_path) {
    if (this.closed) return;
    this.queue.push({
      event_type,
      file_path: file_path ?? null,
      ts: Date.now(),
    });

    if (this.queue.length >= BATCH_MAX_SIZE) {
      await this.flush();
      return;
    }

    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.flush().catch(() => {});
      }, BATCH_FLUSH_MS);
    }
  }

  async flush() {
    if (this.closed) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.queue.length) return;

    const batch = this.queue;
    this.queue = [];

    try {
      // delega transacción y prepared statements al DAO
      await insertWatchEventsBatch(this.db, this.token, batch);
    } catch (err) {
      // reencola con límite para retry
      this.queue = batch.concat(this.queue).slice(0, BATCH_MAX_SIZE * 10);
    }
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
  }
}

// ------------------------------------------------------------
// Core helpers
// ------------------------------------------------------------
function buildWatcher(db, token, absPath, msRemaining) {
  const writer = new EventWriter(db, token);
  const watcher = chokidar.watch(absPath, WATCH_OPTS);

  watcher
    .on("add", (file) => writer.push("add", file))
    .on("addDir", (dir) => writer.push("addDir", dir))
    .on("change", (file) => writer.push("modify", file))
    .on("unlink", (file) => writer.push("unlink", file))
    .on("unlinkDir", (dir) => writer.push("unlinkDir", dir))
    .on("error", (err) => writer.push("error", toErrorString(err)));

  const timer = setTimeout(() => {
    stopWatch(db, token, "expired").catch(() => {});
  }, msRemaining);

  ACTIVE_WATCHES.set(token, { watcher, timer, writer });
  return watcher;
}

// ------------------------------------------------------------
// API pública
// ------------------------------------------------------------
export async function startNewWatch(db, targetPath, durationSeconds) {
  // Resolver y canónicalizar path
  const resolved = path.isAbsolute(targetPath)
    ? targetPath
    : path.resolve(process.cwd(), targetPath);

  if (!fs.existsSync(resolved)) {
    return { error: "NOT_FOUND", message: `No existe: ${resolved}` };
  }

  let absPath = resolved;
  try {
    absPath = fs.realpathSync(resolved);
  } catch (_) {}

  const token = randomUUID();
  const startedAt = Date.now();
  const expiresAt = startedAt + Math.max(1, Math.floor(durationSeconds)) * 1000;

  await insertWatch(db, { token, absPath, startedAt, expiresAt });
  buildWatcher(db, token, absPath, expiresAt - startedAt);

  return { token, path: absPath, startedAt, expiresAt };
}

export async function stopWatch(db, token, reason = "stopped") {
  const entry = ACTIVE_WATCHES.get(token);
  if (!entry) {
    // Aseguramos estado en DB por las dudas (idempotente)
    await updateWatchStatus(
      db,
      token,
      reason === "expired" ? "expired" : "stopped"
    );
    return;
  }

  const { watcher, timer, writer } = entry;
  try {
    if (timer) clearTimeout(timer);
    if (watcher) await watcher.close();
  } catch (_) {}

  try {
    if (writer) await writer.close();
  } catch (_) {}

  ACTIVE_WATCHES.delete(token);
  await updateWatchStatus(
    db,
    token,
    reason === "expired" ? "expired" : "stopped"
  );
}

export async function rehydrateActiveWatches(db) {
  const now = Date.now();
  const rows = await getActiveWatches(db, now);

  for (const row of rows) {
    const token = row.token;
    const absPath = row.abs_path;
    const expiresAt = row.expires_at;

    const remaining = expiresAt - now;
    if (remaining <= 0) {
      await updateWatchStatus(db, token, "expired", now);
      continue;
    }

    if (ACTIVE_WATCHES.has(token)) {
      const entry = ACTIVE_WATCHES.get(token);
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        stopWatch(db, token, "expired").catch(() => {});
      }, remaining);
      continue;
    }

    buildWatcher(db, token, absPath, remaining);
  }
}
