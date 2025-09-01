/**
 * ============================================================================
 * MESSAGE UTILITIES
 * ============================================================================
 *
 * Helpers para construir y validar mensajes del protocolo.
 * Este módulo proporciona funciones para crear mensajes estándar
 * y validar el formato de los mensajes entrantes.
 */

import { PROTOCOL } from "./protocol.js";

/**
 * Construye mensaje de saludo inicial
 * @param {Object} options - Opciones del saludo
 * @param {number} options.maxFrame - Tamaño máximo de frame 
 * @param {number} options.heartbeat - Intervalo de heartbeat
 * @returns {Object} Mensaje de saludo
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
 * @param {string} id - ID del mensaje
 * @param {string} action - Acción que se está respondiendo
 * @param {*} data - Datos de respuesta
 * @returns {Object} Mensaje de respuesta
 */
export function makeResponse(id, action, data = null) {
  return {
    v: PROTOCOL.VERSION,
    t: PROTOCOL.TYPES.RES,
    id,
    act: action,
    data,
  };
}

/**
 * Construye mensaje de error
 * @param {string} id - ID del mensaje
 * @param {string} action - Acción que generó el error
 * @param {string} code - Código de error
 * @param {string} message - Mensaje de error
 * @param {*} details - Detalles adicionales del error
 * @returns {Object} Mensaje de error
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
 * @param {string} id - ID del mensaje
 * @param {string} action - Acción solicitada
 * @param {*} data - Datos del request
 * @returns {Object} Mensaje de request
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
    makeError(
      id,
      action,
      PROTOCOL.ERROR_CODES.UNAUTHORIZED,
      "Authentication required"
    ),

  forbidden: (id, action, requiredScope) =>
    makeError(
      id,
      action,
      PROTOCOL.ERROR_CODES.FORBIDDEN,
      `Required scope: ${requiredScope}`
    ),

  unknownAction: (id, action) =>
    makeError(
      id,
      action,
      PROTOCOL.ERROR_CODES.UNKNOWN_ACTION,
      `Unknown action: ${action}`
    ),

  badRequest: (id, action, details) =>
    makeError(
      id,
      action,
      PROTOCOL.ERROR_CODES.BAD_REQUEST,
      "Invalid request",
      details
    ),

  rateLimited: (id, action) =>
    makeError(
      id,
      action,
      PROTOCOL.ERROR_CODES.RATE_LIMITED,
      "Rate limit exceeded"
    ),

  internalError: (id, action) =>
    makeError(
      id,
      action,
      PROTOCOL.ERROR_CODES.INTERNAL_ERROR,
      "Internal server error"
    ),
};

// Aliases para compatibilidad hacia atrás
export const makeRes = makeResponse;
export const makeErr = makeError;
export const assertEnvelope = validateMessageEnvelope;
