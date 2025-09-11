/**
 * =======================
 * AGENT TCP CONFIGURATION 
 * =======================
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Cargar variables de entorno
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../../.env");
const projectRoot = path.join(__dirname, "../..");
dotenv.config({ path: envPath });

export const config = {
  // Servidor
  TCP_PORT: parseInt(process.env.AGENT_TCP_PORT) || 5001,
  TCP_HOST: process.env.AGENT_TCP_HOST || '0.0.0.0',

  // Base de datos (resolver ruta absoluta desde el directorio del proyecto)
  DB_PATH: path.resolve(projectRoot, process.env.DB_PATH || 'db/db.sqlite'),

  // MQTT Broker
  MQTT_URL: process.env.MQTT_URL || 'mqtt://localhost:1883',
  MQTT_USER: process.env.MQTT_USER || null,
  MQTT_PASS: process.env.MQTT_PASS || null,

  // Cámara por defecto
  DEFAULT_CAMERA: process.env.SNAP_DEFAULT_CAMERA || '/dev/video0',
  DEFAULT_TOPIC: process.env.MQTT_TOPIC_DEFAULT || 'cameras/lab/dev-01/snapshot',

  // Parámetros de imagen
  SNAP_WIDTH: parseInt(process.env.SNAP_WIDTH) || 1280,
  SNAP_HEIGHT: parseInt(process.env.SNAP_HEIGHT) || 720,
  SNAP_QUALITY: parseInt(process.env.SNAP_QUALITY) || 80,
  SNAP_TIMEOUT_MS: parseInt(process.env.SNAP_TIMEOUT_MS) || 5000,

  // Límites de protocolo
  MAX_FRAME_BYTES: parseInt(process.env.MAX_FRAME_BYTES) || 2_097_152,
  MAX_IMAGE_BYTES: parseInt(process.env.MAX_IMAGE_BYTES) || 10_485_760,
  MAX_PAYLOAD_BYTES: 1_048_576,
  
  // Timeouts específicos
  CONNECTION_TIMEOUT_MS: 30_000,
  AUTH_TIMEOUT_MS: 10_000,
};
