/**
 * ============================================================================
 * MESSAGE UTILITIES
 * ============================================================================
 * 
 * Helpers para construir y validar mensajes del protocolo.
 * Responsabilidades:
 * - Factory functions para mensajes estándar
 * - Validación de envelope de mensajes
 * - Manejo consistente de errores
 */

import { PROTOCOL } from "./protocol.js";

/**
 * Construye mensaje de saludo inicial
 */
export function makeHello({ maxFrame, heartbeat }) {
  return {
    v: PROTOCOL.VERSION,
    t: PROTOCOL.TYPES.HELLO,
    data: { maxFrame, heartbeat },
  };
}

/**
 * Construye mensaje de respuesta exitosa
 */
export function makeResponse(id, action, data = null) {
  return { 
    v: PROTOCOL.VERSION, 
    t: PROTOCOL.TYPES.RES, 
    id, 
    act: action, 
    data 
  };
}

/**
 * Construye mensaje de error
 */
export function makeError(id, action, code, message, details = null) {
  return {
    v: PROTOCOL.VERSION,
    t: PROTOCOL.TYPES.ERR,
    id,
    act: action,
    code,
    msg: message,
    details,
  };
}

/**
 * Construye mensaje de request
 */
export function makeRequest(id, action, data = null) {
  return {
    v: PROTOCOL.VERSION,
    t: PROTOCOL.TYPES.REQ,
    id,
    act: action,
    data,
  };
}

/**
 * Valida el envelope básico de un mensaje antes del procesamiento
 * @param {Object} msg - Mensaje a validar
 * @throws {Error} Si el mensaje no es válido
 */
export function validateMessageEnvelope(msg) {
  if (!msg || typeof msg !== "object") {
    const error = new Error("Invalid message format");
    error.code = PROTOCOL.ERROR_CODES.BAD_REQUEST;
    throw error;
  }

  if (msg.v !== PROTOCOL.VERSION) {
    const error = new Error(`Unsupported protocol version: ${msg.v}`);
    error.code = PROTOCOL.ERROR_CODES.BAD_REQUEST;
    throw error;
  }

  if (msg.t !== PROTOCOL.TYPES.REQ) {
    const error = new Error(`Expected request type, got: ${msg.t}`);
    error.code = PROTOCOL.ERROR_CODES.BAD_REQUEST;
    throw error;
  }

  if (!msg.id || typeof msg.id !== "string") {
    const error = new Error("Missing or invalid message ID");
    error.code = PROTOCOL.ERROR_CODES.BAD_REQUEST;
    throw error;
  }

  if (!msg.act || typeof msg.act !== "string") {
    const error = new Error("Missing or invalid action");
    error.code = PROTOCOL.ERROR_CODES.BAD_REQUEST;
    throw error;
  }
}

/**
 * Helper para crear errores estándar comunes
 */
export const ErrorTemplates = {
  unauthorized: (id, action) => 
    makeError(id, action, PROTOCOL.ERROR_CODES.UNAUTHORIZED, "Authentication required"),
    
  forbidden: (id, action, requiredScope) => 
    makeError(id, action, PROTOCOL.ERROR_CODES.FORBIDDEN, `Required scope: ${requiredScope}`),
    
  unknownAction: (id, action) => 
    makeError(id, action, PROTOCOL.ERROR_CODES.UNKNOWN_ACTION, `Unknown action: ${action}`),
    
  badRequest: (id, action, details) => 
    makeError(id, action, PROTOCOL.ERROR_CODES.BAD_REQUEST, "Invalid request", details),
    
  rateLimited: (id, action) => 
    makeError(id, action, PROTOCOL.ERROR_CODES.RATE_LIMITED, "Rate limit exceeded"),
    
  internalError: (id, action) => 
    makeError(id, action, PROTOCOL.ERROR_CODES.INTERNAL_ERROR, "Internal server error"),
};

// Backward compatibility - mantener nombres antiguos
export const makeRes = makeResponse;
export const makeErr = makeError;
export const assertEnvelope = validateMessageEnvelope;
