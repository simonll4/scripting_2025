import si from "systeminformation";
import {
  insertSystemMetric,
  getSystemMetricsLastSeconds,
  cleanupOldMetrics,
} from "../../db/db.js";

const SAMPLE_INTERVAL_MS = 30_000; // 30s
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1h - limpiar métricas antiguas cada hora

let timer = null;
let cleanupTimer = null;
let db = null;

// Inyectar la instancia de DB
export function setDatabase(database) {
  db = database;
}

async function sampleOnce() {
  if (!db) {
    console.warn("Database not set for sampler, skipping sample");
    return;
  }

  try {
    const [load, mem] = await Promise.all([
      si.currentLoad(), // CPU %
      si.mem(), // { total, free, available, ... }
    ]);

    const cpuPercent = load.currentLoad; // 0..100
    const total = mem.total ?? 0;
    const available = mem.available ?? mem.free ?? 0;

    const usedBytes = Math.max(total - available, 0);
    const usedPercent = total > 0 ? (usedBytes / total) * 100 : 0;

    const time = Date.now();

    const metric = {
      cpu: cpuPercent,
      memTotal: total,
      memAvailable: available,
      memUsed: usedBytes,
      memUsedPercent: usedPercent,
      time,
    };

    // Persistir en DB en lugar de memoria
    await insertSystemMetric(db, metric);
  } catch (error) {
    console.error("Error sampling system metrics:", error);
  }
}

async function cleanupOldData() {
  if (!db) return;

  try {
    // Limpiar métricas más antiguas de 24 horas
    await cleanupOldMetrics(db, 24);
  } catch (error) {
    console.error("Error cleaning up old metrics:", error);
  }
}

export function startSampler() {
  if (timer) return;

  sampleOnce(); // primer dato al arranque
  timer = setInterval(sampleOnce, SAMPLE_INTERVAL_MS);

  // Timer para limpiar datos antiguos
  cleanupTimer = setInterval(cleanupOldData, CLEANUP_INTERVAL_MS);
}

export function stopSampler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

export async function getLastSeconds(seconds) {
  if (!db) {
    console.warn("Database not set for sampler");
    return [];
  }

  try {
    const clamped = Math.min(Math.max(Number(seconds) || 60, 1), 3600); // 1..3600
    return await getSystemMetricsLastSeconds(db, clamped);
  } catch (error) {
    console.error("Error getting system metrics:", error);
    return [];
  }
}
