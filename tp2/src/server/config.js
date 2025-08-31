/**
 * Server Configuration
 * Centraliza toda la configuración del servidor
 */
export const CONFIG = {
  // --- Core Server Settings ---
  PORT: parseInt(process.env.PORT || "4000", 10),
  MAX_FRAME: parseInt(process.env.MAX_FRAME || "1000000", 10), // 1MB
  HEARTBEAT_MS: parseInt(process.env.HEARTBEAT_MS || "15000", 10), // 15s

  // --- Rate Limiting (Token Bucket Algorithm) ---
  RL_SOCKET: {
    capacity: parseInt(process.env.RL_SOCKET_CAPACITY || "30", 10),
    refillPerSec: parseInt(process.env.RL_SOCKET_REFILL || "10", 10),
  },
  
  RL_ACT: {
    // Configuraciones específicas por acción
    // "GET_OS_INFO": { capacity: 5, refillPerSec: 1 }
    // Si no está definida, usa RL_ACT_DEFAULT
  },
  
  RL_ACT_DEFAULT: {
    capacity: parseInt(process.env.RL_ACT_CAPACITY || "15", 10),
    refillPerSec: parseInt(process.env.RL_ACT_REFILL || "5", 10),
  },

  // --- Development & Debug ---
  NODE_ENV: process.env.NODE_ENV || "development",
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  DEBUG_PIPELINE: process.env.DEBUG_PIPELINE === "true",
  
  // --- Connection Limits ---
  MAX_CONNECTIONS: parseInt(process.env.MAX_CONNECTIONS || "1000", 10),
  CONNECTION_TIMEOUT: parseInt(process.env.CONNECTION_TIMEOUT || "300000", 10), // 5min
};
