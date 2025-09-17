/**
 * ============================================================================
 * SCHEDULER CONFIGURATION
 * ============================================================================
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Cargar variables de entorno
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../../.env");
dotenv.config({ path: envPath });

export const config = {
  // Conexión al AgentTCP
  AGENT_HOST: process.env.SCHEDULER_AGENT_HOST || "127.0.0.1",
  AGENT_PORT: parseInt(process.env.SCHEDULER_AGENT_PORT) || 5001,
  TOKEN: process.env.SCHEDULER_TOKEN,

  // Scheduling
  INTERVAL_MS: parseInt(process.env.SCHEDULER_INTERVAL_MS) || 5000,

  // Snapshot parameters
  DEFAULT_CAMERA: process.env.SCHEDULER_DEFAULT_CAMERA || "/dev/video0",
  DEFAULT_TOPIC: process.env.SCHEDULER_TOPIC || "cameras/lab/dev-01/snapshot",
  WIDTH: parseInt(process.env.SCHEDULER_SNAP_WIDTH) || 1920,
  HEIGHT: parseInt(process.env.SCHEDULER_SNAP_HEIGHT) || 1080,
  QUALITY: parseInt(process.env.SCHEDULER_SNAP_QUALITY) || 95,
  QUALITY_PRESET: process.env.SCHEDULER_SNAP_PRESET || "max",
};
