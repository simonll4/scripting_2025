/**
 * ============================================================================
 * SECURITY MODULE - PUBLIC API
 * ============================================================================
 *
 * Punto central para importar todas las funcionalidades de seguridad.
 * Evita imports múltiples y centraliza la API del módulo de seguridad.
 */

// Authentication services
export { validateToken, hasScope } from "./auth/token-service.js";

// Authentication validation
export { validateAuth } from "./auth/validator.js";
export { authSchema } from "./auth/schema.js";

// Authorization scopes
export { SCOPES, ROLE_SCOPES } from "./scopes.js";

// Session management
export { touchSession, cleanExpiredSessions } from "./session.js";
