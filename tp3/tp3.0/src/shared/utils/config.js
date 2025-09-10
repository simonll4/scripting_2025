/**
 * ==============================================================
 * CONFIGURATION
 * ==============================================================
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Cargar variables de entorno
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../../../.env");
const projectRoot = path.join(__dirname, "../../..");
dotenv.config({ path: envPath });

/**
 * Configuración del AgentTCP Server
 */
export const AGENT_CONFIG = {
  // Servidor
  TCP_PORT: parseInt(process.env.AGENT_TCP_PORT),

  // Base de datos (resolver ruta absoluta desde el directorio del proyecto)
  DB_PATH: path.resolve(projectRoot, process.env.DB_PATH),

  // MQTT Broker
  MQTT_URL: process.env.MQTT_URL,
  MQTT_USER: process.env.MQTT_USER,
  MQTT_PASS: process.env.MQTT_PASS,

  // Cámara por defecto
  DEFAULT_CAMERA: process.env.SNAP_DEFAULT_CAMERA,
  DEFAULT_TOPIC: process.env.MQTT_TOPIC_DEFAULT,

  // Límites de protocolo
  MAX_FRAME_BYTES: parseInt(process.env.MAX_FRAME_BYTES),
  MAX_IMAGE_BYTES: parseInt(process.env.MAX_IMAGE_BYTES),
};

/**
 * Configuración del Cliente Scheduler
 */
export const SCHEDULER_CONFIG = {
  // Conexión al AgentTCP
  AGENT_HOST: process.env.AGENT_HOST,
  AGENT_PORT: parseInt(process.env.AGENT_TCP_PORT),

  // Token de autenticación (debe ser generado por admin.js)
  TOKEN: process.env.SCHEDULER_TOKEN,

  // Captura
  INTERVAL_MS: parseInt(process.env.INTERVAL_MS),
  CAMERA_ID: process.env.CAMERA_ID,
  TOPIC: process.env.SCHEDULER_TOPIC,

  // Parámetros de imagen
  WIDTH: parseInt(process.env.SNAP_WIDTH),
  HEIGHT: parseInt(process.env.SNAP_HEIGHT),
  QUALITY: parseInt(process.env.SNAP_QUALITY),
};

/**
 * Configuración del Cliente Saver
 */
export const SAVER_CONFIG = {
  // MQTT Subscription
  MQTT_URL: process.env.SAVER_MQTT_URL,
  MQTT_USER: process.env.SAVER_MQTT_USER,
  MQTT_PASS: process.env.SAVER_MQTT_PASS,

  // Filtro de topics
  SUB_TOPIC: process.env.SUB_TOPIC,

  // Almacenamiento
  OUT_DIR: process.env.OUT_DIR,
};

/**
 * Validar configuración crítica
 */
export function validateConfig(config, requiredFields = []) {
  const errors = [];

  for (const field of requiredFields) {
    const value = config[field];

    if (value === undefined || value === null || value === "") {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join("\n")}`);
  }
}
