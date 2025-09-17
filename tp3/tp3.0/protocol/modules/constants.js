/**
 * ============================================================================
 * PROTOCOL CONSTANTS - Camera System TP3.0
 * ============================================================================
 * Protocolo simplificado para el sistema de captura de cámaras
 */

export const PROTOCOL = Object.freeze({
  VERSION: 1,

  TYPES: Object.freeze({
    HELLO: "hello",
    REQ: "req",
    RES: "res", 
    ERR: "err",
  }),

  ERROR_CODES: Object.freeze({
    BAD_REQUEST: "BAD_REQUEST",
    UNAUTHORIZED: "UNAUTHORIZED", 
    AUTH_REQUIRED: "AUTH_REQUIRED",
    INVALID_TOKEN: "INVALID_TOKEN",
    TOKEN_EXPIRED: "TOKEN_EXPIRED",
    UNKNOWN_ACTION: "UNKNOWN_ACTION",
    PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
    INTERNAL_ERROR: "INTERNAL_ERROR",
    CAMERA_NOT_FOUND: "CAMERA_NOT_FOUND",
    CAMERA_BUSY: "CAMERA_BUSY",
    CAPTURE_FAILED: "CAPTURE_FAILED",
    CAPTURE_TIMEOUT: "CAPTURE_TIMEOUT",
    IMAGE_TOO_LARGE: "IMAGE_TOO_LARGE",
  }),

  LIMITS: Object.freeze({
    MAX_FRAME: 2_097_152, // 2MB - tamaño máximo de frame TCP
    MAX_PAYLOAD_BYTES: 1_048_576, // 1MB - payload JSON lógico
    MAX_IMAGE_BYTES: 2_097_152, // 2MB - tamaño máximo de imagen
    CONNECT_TIMEOUT_MS: 10_000, // 10 segundos para conectar
    REQUEST_TIMEOUT_MS: 30_000, // 30 segundos por request
    CAPTURE_TIMEOUT_MS: 5_000, // 5 segundos para captura FFmpeg
  }),

  COMMANDS: Object.freeze({
    HELLO: "HELLO",
    AUTH: "AUTH", 
    SNAPSHOT: "SNAPSHOT",
  }),


  IMAGE_FORMAT: Object.freeze({
    JPEG: "image/jpeg",
  }),

  ENCODING: Object.freeze({
    BASE64: "base64",
  }),
});
