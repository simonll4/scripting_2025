export const PROTOCOL = Object.freeze({
  VERSION: 1,

  TYPES: Object.freeze({
    HELLO: "hello",
    REQ: "req",
    RES: "res",
    ERR: "err",
    PING: "ping",
    PONG: "pong",
    SRV_CLOSE: "srv_close",
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
    TOO_MANY_IN_FLIGHT: "TOO_MANY_IN_FLIGHT",
    DEADLINE_EXCEEDED: "DEADLINE_EXCEEDED",
    INTERNAL_ERROR: "INTERNAL_ERROR",
    CONNECTION: "CONNECTION",
    CMD_NOT_ALLOWED: "CMD_NOT_ALLOWED",
    BIN_NOT_FOUND: "BIN_NOT_FOUND",
    INVALID_REGEX: "INVALID_REGEX",
  }),

  LIMITS: Object.freeze({
    MAX_FRAME: 262_144, // 256KB — tamaño máximo de frame
    MAX_PAYLOAD_BYTES: 64_000, // 64KB — payload JSON lógico
    HEARTBEAT_MS: 15_000, // 15 segundos — ping/pong de aplicación
    MAX_IN_FLIGHT: 8, // Máximo requests concurrentes por conexión
    CMD_TIMEOUT_MS: 10_000, // Timeout por comando en el servidor
    SESSION_TIMEOUT: 1800_000, // 30 minutos
    CONNECT_TIMEOUT_MS: 10_000, // 10 segundos para conectar
    REQUEST_TIMEOUT_MS: 30_000, // 30 segundos por request
  }),

  CORE_ACTS: Object.freeze({
    AUTH: "AUTH",
    QUIT: "QUIT",
  }),

  COMPAT: Object.freeze({
    MIN_CLIENT_VERSION: 1,
    MIN_SERVER_VERSION: 1,
  }),
});