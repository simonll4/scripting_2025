/**
 * ============================================================================
 * UTILITIES INDEX - SINGLE POINT OF ENTRY
 * ============================================================================
 *
 * Punto central para importar todas las utilidades del servidor.
 * Evita imports múltiples y centraliza la API.
 */

// Logging utilities
export { logger } from "./logger.js";

// Transport utilities
export {
  MessageDeframer,
  MessageFramer,
  sendMessage,
  setupTransportPipeline,
} from "../../protocol/index.js";
