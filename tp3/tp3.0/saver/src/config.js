/**
 * ============================================================================
 * SAVER CONFIG
 * ============================================================================
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Cargar variables de entorno
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../../.env");
dotenv.config({ path: envPath });

// Configuración simplificada y profesional
export const config = {
  // MQTT Configuration
  mqtt: {
    url: process.env.MQTT_URL || "mqtt://localhost:1883",
    user: process.env.MQTT_USER || null,
    pass: process.env.MQTT_PASS || null,
    topic: process.env.SAVER_MQTT_TOPIC || "cameras/+/snapshot",
    clientId: `saver-${Date.now()}`,
    qos: 1,
    options: {
      keepalive: 60,
      connectTimeout: 30000,
      reconnectPeriod: 5000,
      clean: true,
    },
  },

  // Storage Configuration
  storage: {
    baseDir: process.env.SAVER_OUT_DIR || "./snapshots",
    organizeByCamera: process.env.SAVER_ORGANIZE_BY_CAMERA !== "false",
    organizeByDate: false,
    checkDuplicates: process.env.SAVER_CHECK_DUPLICATES !== "false",
    maxFileSize: parseInt(process.env.SAVER_MAX_MESSAGE_BYTES) || 15 * 1024 * 1024,
  },

  // Performance Configuration
  performance: {
    statsIntervalMs: 60000, // 1 minuto
  },
};

// Configurar credenciales MQTT si están disponibles
if (config.mqtt.user) {
  config.mqtt.options.username = config.mqtt.user;
}
if (config.mqtt.pass) {
  config.mqtt.options.password = config.mqtt.pass;
}
