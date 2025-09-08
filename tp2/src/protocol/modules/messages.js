/**
 * ============================================================================
 * MESSAGE UTILITIES — STANDARD ENVELOPES
 * ============================================================================
 *
 * - REQ: { v, t:"req", id, act, data, meta:{ clientTs } }
 * - RES: { v, t:"res", id, act, ok:true, data, meta:{ serverTs, latencyMs } }
 * - ERR: { v, t:"err", id, act, ok:false, code, msg, retryAfterMs?, details?, meta:{ serverTs } }
 * - HELLO: hints (maxFrame, maxPayload, heartbeatMs, maxInFlight, version).
 */

import { PROTOCOL } from "./constants.js";

/** Timestamp helper (ms) */
const now = () => Date.now();

/* =============================== */
/*           BUILDERS              */
/* =============================== */

/** HELLO del servidor con hints mínimos */
export function makeHello({
  maxFrame,
  maxPayload,
  heartbeatMs,
  maxInFlight,
  serverVersion = PROTOCOL.VERSION,
} = {}) {
  return {
    v: PROTOCOL.VERSION,
    t: PROTOCOL.TYPES.HELLO,
    data: {
      maxFrame,
      maxPayload,
      heartbeatMs,
      maxInFlight,
      serverVersion,
    },
  };
}

/** REQ: el cliente/servidor envía una solicitud */
export function makeRequest(id, action, data = null, clientTs = now()) {
  return {
    v: PROTOCOL.VERSION,
    t: PROTOCOL.TYPES.REQ,
    id,
    act: action,
    data,
    meta: { clientTs },
  };
}

/** RES: respuesta exitosa (ok:true) */
export function makeResponse(id, action, data = null, startedAt /* ms */) {
  const serverTs = now();
  const meta = { serverTs };
  if (typeof startedAt === "number") {
    meta.latencyMs = Math.max(0, serverTs - startedAt);
  }
  return {
    v: PROTOCOL.VERSION,
    t: PROTOCOL.TYPES.RES,
    id,
    act: action,
    ok: true,
    data,
    meta,
  };
}

/** ERR: respuesta de error (ok:false) */
export function makeError(
  id,
  action,
  code,
  message,
  { retryAfterMs, details, startedAt } = {}
) {
  const serverTs = now();
  const meta = { serverTs };
  if (typeof startedAt === "number") {
    meta.latencyMs = Math.max(0, serverTs - startedAt);
  }
  return {
    v: PROTOCOL.VERSION,
    t: PROTOCOL.TYPES.ERR,
    id,
    act: action,
    ok: false,
    code,
    msg: message,
    ...(retryAfterMs != null ? { retryAfterMs } : {}),
    ...(details != null ? { details } : {}),
    meta,
  };
}

/** Mensajes de latido */
export function makePing() {
  return { v: PROTOCOL.VERSION, t: PROTOCOL.TYPES.PING };
}
export function makePong() {
  return { v: PROTOCOL.VERSION, t: PROTOCOL.TYPES.PONG };
}

/* =============================== */
/*       VALIDADORES BÁSICOS       */
/* =============================== */

/**
 * Valida un envelope de REQ
 * Lanza error con code BAD_REQUEST si no cumple.
 */
export function validateRequestEnvelope(msg) {
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

  if (!msg.id || typeof msg.id !== "string" || msg.id.length > 64) {
    const error = new Error("Missing or invalid message ID");
    error.code = PROTOCOL.ERROR_CODES.BAD_REQUEST;
    throw error;
  }

  if (!msg.act || typeof msg.act !== "string" || msg.act.length > 64) {
    const error = new Error("Missing or invalid action");
    error.code = PROTOCOL.ERROR_CODES.BAD_REQUEST;
    throw error;
  }

  // meta opcional
  if (msg.meta && typeof msg.meta !== "object") {
    const error = new Error("Invalid meta");
    error.code = PROTOCOL.ERROR_CODES.BAD_REQUEST;
    throw error;
  }
}

/** Type helpers*/
export const isResponse = (m) =>
  m && m.t === PROTOCOL.TYPES.RES && m.ok === true;
export const isError = (m) => m && m.t === PROTOCOL.TYPES.ERR && m.ok === false;
export const isPing = (m) => m && m.t === PROTOCOL.TYPES.PING;
export const isPong = (m) => m && m.t === PROTOCOL.TYPES.PONG;

/* =============================== */
/*     HELPERS DE ERRORES COMUNES  */
/* =============================== */

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
    makeError(id, action, PROTOCOL.ERROR_CODES.BAD_REQUEST, "Invalid request", {
      details,
    }),

  rateLimited: (id, action, retryAfterMs) =>
    makeError(
      id,
      action,
      PROTOCOL.ERROR_CODES.RATE_LIMITED,
      "Rate limit exceeded",
      { retryAfterMs }
    ),

  tooManyInFlight: (id, action, retryAfterMs) =>
    makeError(
      id,
      action,
      PROTOCOL.ERROR_CODES.TOO_MANY_IN_FLIGHT,
      "Too many in-flight requests",
      { retryAfterMs }
    ),

  payloadTooLarge: (id, action) =>
    makeError(
      id,
      action,
      PROTOCOL.ERROR_CODES.PAYLOAD_TOO_LARGE,
      "Payload too large"
    ),

  deadlineExceeded: (id, action) =>
    makeError(
      id,
      action,
      PROTOCOL.ERROR_CODES.DEADLINE_EXCEEDED,
      "Command deadline exceeded"
    ),

  internalError: (id, action) =>
    makeError(
      id,
      action,
      PROTOCOL.ERROR_CODES.INTERNAL_ERROR,
      "Internal server error"
    ),

  invalidToken: (id, action) =>
    makeError(id, action, PROTOCOL.ERROR_CODES.INVALID_TOKEN, "Invalid token"),

  tokenExpired: (id, action, retryAfterMs) =>
    makeError(id, action, PROTOCOL.ERROR_CODES.TOKEN_EXPIRED, "Token expired", {
      retryAfterMs,
    }),
};
