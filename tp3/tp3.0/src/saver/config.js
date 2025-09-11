/**
 * ============================================================================
 * SAVER CONFIG - Camera System TP3.0
 * ============================================================================
 * Configuración específica del módulo Saver
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Cargar variables de entorno
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../../.env");
dotenv.config({ path: envPath });

export const config = {
  // MQTT Configuration
  MQTT_URL: process.env.SAVER_MQTT_URL || process.env.MQTT_URL || 'mqtt://localhost:1883',
  MQTT_USER: process.env.SAVER_MQTT_USER || process.env.MQTT_USER || null,
  MQTT_PASS: process.env.SAVER_MQTT_PASS || process.env.MQTT_PASS || null,
  
  // Filtro de topics
  SUB_TOPIC: process.env.SUB_TOPIC || 'cameras/+/+/snapshot',
  
  // File Storage Configuration
  OUT_DIR: process.env.OUT_DIR || './snapshots',
  ORGANIZE_BY_CAMERA: true,
  ORGANIZE_BY_DATE: true,
  CHECK_DUPLICATES: true,
  MAX_FILE_AGE_DAYS: 30,
  
  // Validation Configuration
  STRICT_MODE: false,
  MAX_MESSAGE_SIZE: 10485760,  // 10MB
  REQUIRED_FIELDS: ['cameraId', 'timestamp', 'format', 'data'],
  SUPPORTED_FORMATS: ['image/jpeg', 'image/png'],
  LOG_INVALID_MESSAGES: true,
  
  // Performance Configuration
  STATS_INTERVAL_MS: 60000,
  CLEANUP_INTERVAL_MS: 3600000,
  MAX_CONCURRENT_SAVES: 10,
  ENABLE_COMPRESSION: false,
  
  // Logging Configuration
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  ENABLE_FILE_LOG: false,
  LOG_DIR: './logs',
  MAX_LOG_SIZE: 10485760,
  MAX_LOG_FILES: 5,
  
  // Error Handling
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  FAIL_ON_DISK_ERROR: false,
  DEAD_LETTER_QUEUE: false,
};
