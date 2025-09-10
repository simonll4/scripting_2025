/**
 * ============================================================================
 * MESSAGE UTILITIES - Camera System TP3.0
 * ============================================================================
 * 
 * Builders para mensajes del protocolo:
 * - REQ: { v, t:"req", id, act, data, meta:{ clientTs } }
 * - RES: { v, t:"res", id, act, ok:true, data, meta:{ serverTs, latencyMs } }
 * - ERR: { v, t:"err", id, act, ok:false, code, msg, details?, meta:{ serverTs } }
 * - HELLO: { v, t:"hello", data: { maxFrame, maxPayload, serverVersion } }
 */

import { PROTOCOL } from "./constants.js";

/** Timestamp helper optimizado */
const now = () => Date.now();

/* =============================== */
/*           BUILDERS              */
/* =============================== */

/** HELLO del servidor con configuración y validación */
export function makeHello({
  maxFrame = PROTOCOL.LIMITS.MAX_FRAME,
  maxPayload = PROTOCOL.LIMITS.MAX_PAYLOAD_BYTES,
  serverVersion = PROTOCOL.VERSION,
} = {}) {
  // Validar límites
  if (maxFrame < 1 || maxFrame > 10_000_000) {
    throw new Error(`Invalid maxFrame: ${maxFrame}`);
  }
  
  if (maxPayload < 1 || maxPayload > 5_000_000) {
    throw new Error(`Invalid maxPayload: ${maxPayload}`);
  }
  
  return {
    v: PROTOCOL.VERSION,
    t: PROTOCOL.TYPES.HELLO,
    data: {
      maxFrame,
      maxPayload,
      serverVersion,
    },
  };
}

/** REQ: el cliente envía una solicitud con validación */
export function makeRequest(id, action, data = null, clientTs = now()) {
  if (!id || typeof id !== 'string') {
    throw new Error('Request ID must be a non-empty string');
  }
  
  if (!action || typeof action !== 'string') {
    throw new Error('Action must be a non-empty string');
  }
  
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
export function makeResponse(id, action, data = null, startedAt = null) {
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
  { details, startedAt } = {}
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
    ...(details != null ? { details } : {}),
    meta,
  };
}

/* =============================== */
/*          VALIDATORS             */
/* =============================== */

/**
 * Valida estructura básica de mensaje
 */
export function isValidMessage(msg) {
  return (
    msg &&
    typeof msg === "object" &&
    typeof msg.v === "number" &&
    typeof msg.t === "string" &&
    Object.values(PROTOCOL.TYPES).includes(msg.t)
  );
}

/**
 * Valida estructura de request
 */
export function isValidRequest(msg) {
  return (
    isValidMessage(msg) &&
    msg.t === PROTOCOL.TYPES.REQ &&
    typeof msg.id === "string" &&
    typeof msg.act === "string" &&
    msg.meta &&
    typeof msg.meta.clientTs === "number"
  );
}

/**
 * Valida estructura de response
 */
export function isValidResponse(msg) {
  return (
    isValidMessage(msg) &&
    (msg.t === PROTOCOL.TYPES.RES || msg.t === PROTOCOL.TYPES.ERR) &&
    typeof msg.id === "string" &&
    typeof msg.act === "string" &&
    typeof msg.ok === "boolean" &&
    msg.meta &&
    typeof msg.meta.serverTs === "number"
  );
}

/**
 * Valida estructura de HELLO
 */
export function isValidHello(msg) {
  return (
    isValidMessage(msg) &&
    msg.t === PROTOCOL.TYPES.HELLO &&
    msg.data &&
    typeof msg.data.maxFrame === "number" &&
    typeof msg.data.maxPayload === "number" &&
    typeof msg.data.serverVersion === "number"
  );
}

/* =============================== */
/*       CONVENIENCE CHECKS        */
/* =============================== */

export function isResponse(msg) {
  return isValidMessage(msg) && msg.t === PROTOCOL.TYPES.RES;
}

export function isError(msg) {
  return isValidMessage(msg) && msg.t === PROTOCOL.TYPES.ERR;
}

export function isHello(msg) {
  return isValidMessage(msg) && msg.t === PROTOCOL.TYPES.HELLO;
}

export function isRequest(msg) {
  return isValidMessage(msg) && msg.t === PROTOCOL.TYPES.REQ;
}
