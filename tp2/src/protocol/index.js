/**
 * ============================================================================
 * PROTOCOL MODULE - MAIN EXPORT
 * ============================================================================
 *
 * Módulo centralizado del protocolo de comunicación.
 * Este módulo puede ser usado tanto por el cliente como por el servidor
 * para mantener consistencia en el protocolo de comunicación.
 *
 * Exports:
 * - PROTOCOL: Constantes del protocolo (versiones, tipos, códigos de error, etc.)
 * - SCOPES: Definiciones de scopes de autorización
 * - Message builders: Funciones para construir mensajes estándar
 * - Message validation: Funciones para validar mensajes
 * - Error templates: Plantillas para errores comunes
 */

// Protocol definitions
export { PROTOCOL } from "./protocol.js";

// Message utilities
export {
  makeHello,
  makeResponse,
  makeError,
  makeRequest,
  validateMessageEnvelope,
  ErrorTemplates,
  // Backward compatibility aliases
  makeRes,
  makeErr,
  assertEnvelope,
} from "./messages.js";
