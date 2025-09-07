/**
 * Server Configuration
 * Centraliza toda la configuración del servidor
 */
import { PROTOCOL } from "../protocol/index.js";
import { OS_CMD_POLICY } from "./business/commands/oscmd/config.js";

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
};

// Export command-specific configurations
export { OS_CMD_POLICY };
