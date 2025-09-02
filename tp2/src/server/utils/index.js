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

// Authentication utilities
export {
  validateToken,
  createSession,
  hasScope,
  touchSession,
  cleanExpiredSessions,
} from "./auth/auth.js";

// Authorization scopes - Server-specific
export { SCOPES, ROLE_SCOPES } from "./auth/scopes.js";

// Authentication schemas and validation
export { authSchema } from "./auth/auth-schema.js";
export { validateAuth } from "./auth/auth-validator.js";

// Transport utilities
export {
  MessageDeframer,
  MessageFramer,
  sendMessage,
  setupTransportPipeline,
} from "../../protocol/index.js";
