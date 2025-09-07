/**
 * ============================================================================
 * AUTHORIZATION SCOPES
 * ============================================================================
 *
 * Definiciones de scopes para autorización del servidor.
 * Estos scopes son específicos de la implementación del servidor
 * y definen qué acciones puede realizar un token/usuario.
 */

export const SCOPES = Object.freeze({
  // Scopes para comandos específicos
  GET_OS_INFO: "getosinfo",
  WATCH: "watch",
  GET_WATCHES: "getwatches",
  PS: "ps",
  OSCMD: "oscmd",

  // Scope administrativo
  ADMIN: "admin",

  // Scope universal
  ALL: "*",
});

/**
 * Mapeo de roles a scopes para el sistema de administración
 * Usado por admin.js para crear tokens con los scopes apropiados
 */
export const ROLE_SCOPES = Object.freeze({
  user: [SCOPES.GET_OS_INFO, SCOPES.WATCH, SCOPES.GET_WATCHES],
  admin: [SCOPES.ALL],
});
