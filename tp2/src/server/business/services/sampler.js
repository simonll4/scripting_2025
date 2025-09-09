import si from "systeminformation";
import {
  insertSystemMetric,
  getSystemMetricsLastSeconds,
  cleanupOldMetrics,
} from "../../db/db.js";

// ---------------- Configuración de muestreo/retención ----------------
const SAMPLE_INTERVAL_MS = 30_000; // 30 s
const RETENTION_HOURS = 1; // conservar última hora

// Limpiezas: forzada (failsafe) + throttled
const CLEANUP_FORCE_INTERVAL_MS = 10 * 60 * 1000; // cada 10 min
const CLEANUP_MIN_SPACING_MS = 2 * 60 * 1000; // ≥ 2 min entre limpiezas

// “Traer todo”: igual estará limitado por la retención efectiva (1 h)
const MAX_WINDOW_SECONDS = RETENTION_HOURS * 3600; // 3600 s

// ---------------- Estado interno ----------------
let timer = null;
let cleanupTimer = null;
let db = null;

let cleaning = false; // evita limpiezas concurrentes
let lastCleanupTs = 0; // última limpieza efectiva (epoch ms)

// ---------------- Helpers ----------------
export function setDatabase(database) {
  db = database;
}

async function sampleOnce() {
  if (!db) {
    console.warn("Database not set for sampler, skipping sample");
  } else {
    try {
      const [load, mem] = await Promise.all([
        si.currentLoad(), // % CPU
        si.mem(), // { total, available, ... }
      ]);

      const cpuPercent = load.currentLoad; // 0..100
      const total = mem.total ?? 0;
      const available = mem.available ?? mem.free ?? 0;

      const usedBytes = Math.max(total - available, 0);
      const usedPercent = total > 0 ? (usedBytes / total) * 100 : 0;

      const metric = {
        cpu: cpuPercent,
        memTotal: total,
        memAvailable: available,
        memUsed: usedBytes,
        memUsedPercent: usedPercent,
        time: Date.now(),
      };

      await insertSystemMetric(db, metric);
    } catch (error) {
      console.error("Error sampling system metrics:", error);
    }
  }

  // Intentar limpieza con throttling (si hay DB y pasó tiempo mínimo)
  maybeCleanup(/* force */ false).catch((e) =>
    console.error("Cleanup (throttled) error:", e)
  );
}

/**
 * Ejecuta cleanupOldMetrics(db, RETENTION_HOURS) con:
 * - Debounce/Throttling para no hacerlo en cada inserción.
 * - Bloqueo para evitar limpiezas concurrentes.
 * - Modo forzado para el timer periódico.
 */
async function maybeCleanup(force) {
  if (!db) return;
  const now = Date.now();

  if (!force && now - lastCleanupTs < CLEANUP_MIN_SPACING_MS) {
    return; // muy pronto para otra limpieza
  }
  if (cleaning) return; // ya hay una limpieza en curso

  cleaning = true;
  try {
    await cleanupOldMetrics(db, RETENTION_HOURS);
    lastCleanupTs = now;
  } catch (err) {
    // Registrar, pero no romper el flujo
    console.error("Error cleaning up old metrics:", err);
  } finally {
    cleaning = false;
  }
}

export function startSampler() {
  if (timer) return;

  // primer muestreo al arranque
  sampleOnce();

  // muestreo periódico
  timer = setInterval(sampleOnce, SAMPLE_INTERVAL_MS);

  // limpieza periódica forzada como "seguro" (cada 10 minutos)
  cleanupTimer = setInterval(() => {
    maybeCleanup(/* force */ true).catch((e) =>
      console.error("Cleanup (forced) error:", e)
    );
  }, CLEANUP_FORCE_INTERVAL_MS);
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
    // 1..3600 segundos
    const clamped = Math.min(Math.max(Number(seconds) || 60, 1), 3600);
    return await getSystemMetricsLastSeconds(db, clamped);
  } catch (error) {
    console.error("Error getting system metrics:", error);
    return [];
  }
}

// Devuelve todas las muestras disponibles (limitado por la retención)
export async function getAllSamples() {
  if (!db) {
    console.warn("Database not set for sampler");
    return [];
  }
  try {
    return await getSystemMetricsLastSeconds(db, MAX_WINDOW_SECONDS);
  } catch (error) {
    console.error("Error getting all system metrics:", error);
    return [];
  }
}

// import si from "systeminformation";
// import {
//   insertSystemMetric,
//   getSystemMetricsLastSeconds,
//   cleanupOldMetrics,
// } from "../../db/db.js";

// const SAMPLE_INTERVAL_MS = 30_000; // 30s
// const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10min - limpiar métricas antiguas cada 10 minutos
// const MAX_WINDOW_SECONDS = 365 * 24 * 60 * 60; // 1 año en segundos (para "todas")

// let timer = null;
// let cleanupTimer = null;
// let db = null;

// // Inyectar la instancia de DB
// export function setDatabase(database) {
//   db = database;
// }

// async function sampleOnce() {
//   if (!db) {
//     console.warn("Database not set for sampler, skipping sample");
//     return;
//   }

//   try {
//     const [load, mem] = await Promise.all([
//       si.currentLoad(), // CPU %
//       si.mem(), // { total, free, available, ... }
//     ]);

//     const cpuPercent = load.currentLoad; // 0..100
//     const total = mem.total ?? 0;
//     const available = mem.available ?? mem.free ?? 0;

//     const usedBytes = Math.max(total - available, 0);
//     const usedPercent = total > 0 ? (usedBytes / total) * 100 : 0;

//     const time = Date.now();

//     const metric = {
//       cpu: cpuPercent,
//       memTotal: total,
//       memAvailable: available,
//       memUsed: usedBytes,
//       memUsedPercent: usedPercent,
//       time,
//     };

//     // Persistir en DB
//     await insertSystemMetric(db, metric);

//     // Limpiar métricas antiguas después de cada inserción para mantener exactamente 1 hora
//     await cleanupOldMetrics(db, 1);
//   } catch (error) {
//     console.error("Error sampling system metrics:", error);
//   }
// }

// async function cleanupOldData() {
//   if (!db) return;

//   try {
//     // Limpiar métricas más antiguas de 1 hora
//     await cleanupOldMetrics(db, 1);
//   } catch (error) {
//     console.error("Error cleaning up old metrics:", error);
//   }
// }

// export function startSampler() {
//   if (timer) return;

//   sampleOnce(); // primer dato al arranque
//   timer = setInterval(sampleOnce, SAMPLE_INTERVAL_MS);

//   // Timer para limpiar datos antiguos
//   cleanupTimer = setInterval(cleanupOldData, CLEANUP_INTERVAL_MS);
// }

// export function stopSampler() {
//   if (timer) {
//     clearInterval(timer);
//     timer = null;
//   }
//   if (cleanupTimer) {
//     clearInterval(cleanupTimer);
//     cleanupTimer = null;
//   }
// }

// export async function getLastSeconds(seconds) {
//   if (!db) {
//     console.warn("Database not set for sampler");
//     return [];
//   }

//   try {
//     const clamped = Math.min(Math.max(Number(seconds) || 60, 1), 3600); // 1..3600
//     return await getSystemMetricsLastSeconds(db, clamped);
//   } catch (error) {
//     console.error("Error getting system metrics:", error);
//     return [];
//   }
// }

// //  devuelve todas las muestras disponibles (limitado por la retención de datos)
// export async function getAllSamples() {
//   if (!db) {
//     console.warn("Database not set for sampler");
//     return [];
//   }
//   try {
//     // Usamos una ventana muy grande para englobar “todo lo retenido”
//     return await getSystemMetricsLastSeconds(db, MAX_WINDOW_SECONDS);
//   } catch (error) {
//     console.error("Error getting all system metrics:", error);
//     return [];
//   }
// }
