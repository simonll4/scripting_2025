/**
 * Server Configuration
 * Centraliza toda la configuración del servidor
 */
import { PROTOCOL } from "../protocol/index.js";

export const CONFIG = {
  // --- Core Server Settings ---
  PORT: parseInt(process.env.PORT || "4000", 10),
  MAX_FRAME: parseInt(
    process.env.MAX_FRAME || PROTOCOL.LIMITS.MAX_FRAME.toString(),
    10
  ),
  HEARTBEAT_MS: parseInt(
    process.env.HEARTBEAT_MS || PROTOCOL.LIMITS.HEARTBEAT_MS.toString(),
    10
  ),

  // --- Rate Limiting (Token Bucket Algorithm) ---
  RL_SOCKET: {
    capacity: parseInt(process.env.RL_SOCKET_CAPACITY || "30", 10),
    refillPerSec: parseInt(process.env.RL_SOCKET_REFILL || "10", 10),
  },

  // --- Development & Debug ---
  NODE_ENV: process.env.NODE_ENV || "development",
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  DEBUG_PIPELINE: process.env.DEBUG_PIPELINE === "true",

  // --- Connection Limits ---
  MAX_CONNECTIONS: parseInt(process.env.MAX_CONNECTIONS || "1000", 10),
  CONNECTION_TIMEOUT: parseInt(process.env.CONNECTION_TIMEOUT || "300000", 10), // 5min
};
