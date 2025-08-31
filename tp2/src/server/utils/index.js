/**
 * ============================================================================
 * UTILITIES INDEX - SINGLE POINT OF ENTRY
 * ============================================================================
 *
 * Punto central para importar todas las utilidades del servidor.
 * Evita imports múltiples y centraliza la API.
 */

// Authentication utilities
export {
  validateToken,
  createSession,
  hasScope,
  // TODO: touchSession - Session last-access tracking - Not used anywhere
  // touchSession,
  // TODO: cleanExpiredSessions - Session cleanup utility - Not used anywhere
  // cleanExpiredSessions,
} from "./auth/auth.js";

// Authentication schemas and validation
export { authSchema } from "./auth/auth-schema.js";
export { validateAuth } from "./auth/auth-validator.js";

// Transport utilities
export {
  MessageDeframer,
  MessageFramer,
  sendMessage,
  // TODO: setupTransportPipeline - Pipeline setup utility - Not used anywhere
  // setupTransportPipeline,
} from "./transport/transport.js";

// Protocol definitions
export { PROTOCOL, SCOPES } from "./protocol/protocol.js";

// Message utilities
export {
  makeHello,
  makeResponse,
  makeError,
  // TODO: makeRequest - Client request builder - Not used anywhere
  // makeRequest,
  // TODO: validateMessageEnvelope - Message format validator - Not used anywhere  
  // validateMessageEnvelope,
  // TODO: ErrorTemplates - Pre-built error responses - Not used anywhere
  // ErrorTemplates,
  // Backward compatibility
  makeRes,
  makeErr,
  assertEnvelope,
} from "./protocol/messages.js";

// TODO: Legacy aliases - Backward compatibility names - Not used currently
// export { sendMessage as send } from "./transport/transport.js";
// export { MessageDeframer as Deframer } from "./transport/transport.js";
// export { MessageFramer as Framer } from "./transport/transport.js";
