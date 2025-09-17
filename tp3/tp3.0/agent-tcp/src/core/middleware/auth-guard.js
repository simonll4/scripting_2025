/**
 * ============================================================================
 * AUTH GUARD MIDDLEWARE - Camera System TP3.0
 * ============================================================================
 * Middleware para verificar autenticación y scopes
 */

import { PROTOCOL } from "../../../../protocol/index.js";

/**
 * Verifica que la conexión esté autenticada
 */
export function requireAuth(connState) {
  if (!connState.authenticated) {
    return {
      error: true,
      code: PROTOCOL.ERROR_CODES.AUTH_REQUIRED,
      message: "Authentication required"
    };
  }
  return { error: false };
}

/**
 * Verifica que la conexión tenga los scopes necesarios
 */
export function requireScopes(connState, requiredScopes = []) {
  const authCheck = requireAuth(connState);
  if (authCheck.error) {
    return authCheck;
  }

  // Verificar scopes usando la lógica directa
  const scopes = connState.session?.scopes || [];
  
  // Scope wildcard (*) da acceso total
  if (scopes.includes("*")) {
    return { error: false };
  }
  
  // Verificar que tenga al menos uno de los scopes requeridos
  const hasRequiredScope = requiredScopes.some(scope => scopes.includes(scope));
  
  if (requiredScopes.length > 0 && !hasRequiredScope) {
    return {
      error: true,
      code: PROTOCOL.ERROR_CODES.UNAUTHORIZED,
      message: "Insufficient permissions"
    };
  }

  return { error: false };
}

/**
 * Middleware wrapper que aplica verificaciones y ejecuta handler
 */
export function withAuth(handler, requiredScopes = []) {
  return async (connState, requestData, requestMeta, services) => {
    // Verificar autenticación
    if (requiredScopes.length > 0) {
      const scopeCheck = requireScopes(connState, requiredScopes);
      if (scopeCheck.error) {
        return {
          success: false,
          errorCode: scopeCheck.code,
          errorMessage: scopeCheck.message
        };
      }
    } else {
      const authCheck = requireAuth(connState);
      if (authCheck.error) {
        return {
          success: false,
          errorCode: authCheck.code,
          errorMessage: authCheck.message
        };
      }
    }

    // Ejecutar handler original con todos los parámetros
    return handler(connState, requestData, requestMeta, services);
  };
}
