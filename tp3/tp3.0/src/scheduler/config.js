/**
 * ============================================================================
 * SCHEDULER CONFIGURATION - Camera System TP3.0
 * ============================================================================
 * Configuración específica para el scheduler
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
  AGENT_HOST: process.env.AGENT_HOST || '127.0.0.1',
  AGENT_PORT: parseInt(process.env.AGENT_TCP_PORT) || 5001,

  // Token de autenticación
  TOKEN: process.env.SCHEDULER_TOKEN,

  // Captura
  INTERVAL_MS: parseInt(process.env.INTERVAL_MS) || 5000,
  CAMERA_ID: process.env.CAMERA_ID || '/dev/video0',
  TOPIC: process.env.SCHEDULER_TOPIC || 'cameras/lab/dev-01/snapshot',

  // Parámetros de imagen
  WIDTH: parseInt(process.env.SNAP_WIDTH) || 1280,
  HEIGHT: parseInt(process.env.SNAP_HEIGHT) || 720,
  QUALITY: parseInt(process.env.SNAP_QUALITY) || 80,
  
  // Configuraciones específicas del scheduler
  MAX_RETRY_ATTEMPTS: 5,
  BASE_RETRY_DELAY_MS: 1000,
  MAX_RETRY_DELAY_MS: 30000,
  
  // Timeouts específicos
  CONNECTION_TIMEOUT_MS: 10_000,
  AUTH_TIMEOUT_MS: 10_000,
  SNAPSHOT_TIMEOUT_MS: 30_000,
  
  // Estadísticas
  STATS_LOG_INTERVAL_MS: 60_000,
};
