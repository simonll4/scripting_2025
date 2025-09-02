import si from "systeminformation";

const SAMPLE_INTERVAL_MS = 30_000; // 30s
const WINDOW_MS = 60 * 60 * 1000; // 1h
const MAX_SAMPLES = Math.ceil(WINDOW_MS / SAMPLE_INTERVAL_MS);

let samples = [];
let timer = null;

async function sampleOnce() {
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

    samples.push({
      cpu: cpuPercent,
      memTotal: total,
      memAvailable: available,
      memUsed: usedBytes, // <-- “uso” en bytes
      memUsedPercent: usedPercent, // <-- “uso” en %
      time,
    });

    // recortar a 1h
    if (samples.length > MAX_SAMPLES) {
      samples = samples.slice(samples.length - MAX_SAMPLES);
    }
  } catch {}
}

export function startSampler() {
  if (timer) return;
  sampleOnce(); // primer dato al arranque
  timer = setInterval(sampleOnce, SAMPLE_INTERVAL_MS);
}

export function stopSampler() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function getLastSeconds(seconds) {
  const now = Date.now();
  const clamped = Math.min(Math.max(Number(seconds) || 60, 1), 3600); // 1..3600
  const cutoff = now - clamped * 1000;
  return samples.filter((s) => s.time >= cutoff);
}
