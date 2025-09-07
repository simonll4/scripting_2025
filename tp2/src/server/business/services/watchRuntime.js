import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import chokidar from "chokidar";

// token -> { watcher, timer }
const ACTIVE_WATCHES = new Map();

// Helpers DB
async function insertWatch(db, { token, absPath, startedAt, expiresAt }) {
  await db.run(
    "INSERT INTO watches (token, abs_path, started_at, expires_at, status) VALUES (?, ?, ?, ?, 'active')",
    [token, absPath, startedAt, expiresAt]
  );
}

async function updateWatchStatus(db, token, status) {
  await db.run(
    "UPDATE watches SET status = ?, expires_at = MAX(expires_at, ?) WHERE token = ? AND status = 'active'",
    [status, Date.now(), token]
  );
}

async function insertEvent(db, token, eventType, filePath) {
  const ts = Date.now();
  await db.run(
    "INSERT INTO watch_events (token, event_type, file_path, ts) VALUES (?, ?, ?, ?)",
    [token, eventType, filePath ?? null, ts]
  );
}

export async function stopWatch(db, token, reason = "stopped") {
  const entry = ACTIVE_WATCHES.get(token);
  if (!entry) return;
  const { watcher, timer } = entry;
  try {
    if (timer) clearTimeout(timer);
    if (watcher) await watcher.close();
  } catch (_) {}
  ACTIVE_WATCHES.delete(token);
  await updateWatchStatus(
    db,
    token,
    reason === "expired" ? "expired" : "stopped"
  );
}

function buildWatcher(db, token, absPath, msRemaining) {
  // Queremos registrar eventos post-arranque, no el estado inicial.
  const watcher = chokidar.watch(absPath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    // podés agregar include/exclude con 'ignored' si lo necesitás luego
    // depth: opcional si querés limitar recursividad
    persistent: false, // no bloquea el proceso
    followSymlinks: true,
  });

  // Eventos típicos de chokidar:
  // add, addDir, change, unlink, unlinkDir, ready, raw, error
  watcher
    .on("add", (file) => insertEvent(db, token, "add", file))
    .on("addDir", (dir) => insertEvent(db, token, "addDir", dir))
    .on("change", (file) => insertEvent(db, token, "modify", file))
    .on("unlink", (file) => insertEvent(db, token, "unlink", file))
    .on("unlinkDir", (dir) => insertEvent(db, token, "unlinkDir", dir))
    .on("error", (err) => insertEvent(db, token, "error", String(err)));

  const timer = setTimeout(() => {
    stopWatch(db, token, "expired").catch(() => {});
  }, msRemaining);

  ACTIVE_WATCHES.set(token, { watcher, timer });
  return watcher;
}

/**
 * Arranca un nuevo watch (comando watch)
 */
export async function startNewWatch(db, targetPath, durationSeconds) {
  // Si el path es absoluto, lo usamos tal como está
  // Si es relativo, lo resolvemos contra el directorio actual
  const absPath = path.isAbsolute(targetPath) 
    ? targetPath 
    : path.resolve(process.cwd(), targetPath);

  // ÚNICA validación que no puede ir al schema: existencia del path
  if (!fs.existsSync(absPath)) {
    return { error: "NOT_FOUND", message: `No existe: ${absPath}` };
  }

  const token = randomUUID();
  const startedAt = Date.now();
  const expiresAt = startedAt + durationSeconds * 1000;

  await insertWatch(db, { token, absPath, startedAt, expiresAt });
  buildWatcher(db, token, absPath, expiresAt - startedAt);

  return { token, path: absPath, startedAt, expiresAt };
}

/**
 * Rehidrata watches activos al boot.
 * Crea de nuevo los watchers con el tiempo restante.
 */
export async function rehydrateActiveWatches(db) {
  const now = Date.now();
  const rows = await db.all(
    "SELECT token, abs_path, started_at, expires_at FROM watches WHERE status='active' AND expires_at > ?",
    [now]
  );

  for (const row of rows) {
    const {
      token,
      abs_path: absPath,
      started_at: startedAt,
      expires_at: expiresAt,
    } = row;
    const remaining = expiresAt - now;
    if (remaining <= 0) {
      await updateWatchStatus(db, token, "expired");
      continue;
    }
    buildWatcher(db, token, absPath, remaining);
  }
}
