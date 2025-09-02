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
    FORBIDDEN: "FORBIDDEN",
    UNKNOWN_ACTION: "UNKNOWN_ACTION",
    PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
    RATE_LIMITED: "RATE_LIMITED",
    INTERNAL_ERROR: "INTERNAL_ERROR",
    CONNECTION: "CONNECTION",
  }),

  LIMITS: Object.freeze({
    MAX_FRAME: 262_144, // 256KB
    HEARTBEAT_MS: 30_000, // 30 segundos
    MAX_IN_FLIGHT: 8, // Máximo requests concurrentes
    SESSION_TIMEOUT: 1800_000, // 30 minutos
  }),

  CORE_ACTS: Object.freeze({
    AUTH: "AUTH",
  }),

  COMPAT: Object.freeze({
    MIN_CLIENT_VERSION: 1,
    MIN_SERVER_VERSION: 1,
  }),
});
