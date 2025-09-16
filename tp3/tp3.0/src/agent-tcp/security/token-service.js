/**
 * ============================================================================
 * TOKEN SERVICE
 * ============================================================================
 * Servicio de autenticación de tokens, extraído y refactorizado desde auth.js
 */

import argon2 from "argon2";

/**
 * Valida un token en formato "tokenId.secret"
 * @param {Object} db - Instancia de base de datos
 * @param {string} tokenString - Token completo
 * @returns {Object} Resultado de validación
 */
export async function validateToken(db, tokenString) {
  // Parsear formato tokenId.secret
  const dotIndex = tokenString.indexOf(".");
  if (dotIndex <= 0) {
    return { valid: false, reason: "invalid_format" };
  }
  
  const tokenId = tokenString.slice(0, dotIndex);
  const secret = tokenString.slice(dotIndex + 1);
  
  // Buscar token en DB (usaremos el repositorio)
  const { getTokenById } = await import("../db/repositories/tokens.js");
  const tokenRow = await getTokenById(db, tokenId);
  
  if (!tokenRow) {
    return { valid: false, reason: "not_found" };
  }
  
  // Verificar si está revocado
  if (tokenRow.revoked) {
    return { valid: false, reason: "revoked" };
  }
  
  // Verificar expiración
  if (tokenRow.expires_at && Date.now() > tokenRow.expires_at) {
    return { valid: false, reason: "expired" };
  }
  
  // Verificar secret con argon2
  const isValidSecret = await argon2.verify(tokenRow.secretHash, secret);
  if (!isValidSecret) {
    return { valid: false, reason: "invalid_secret" };
  }
  
  // Token válido
  return {
    valid: true,
    tokenId,
    scopes: JSON.parse(tokenRow.scopes || "[]")
  };
}

/**
 * Verifica si un cliente tiene un scope específico
 */
export function hasScope(session, requiredScope) {
  const scopes = session?.scopes || [];
  
  // Scope wildcard (*) da acceso total
  if (scopes.includes("*")) return true;
  
  // Verificar scope específico
  return scopes.includes(requiredScope);
}

/**
 * Verifica si un cliente tiene alguno de los scopes requeridos
 */
export function hasAnyScope(session, requiredScopes = []) {
  if (requiredScopes.length === 0) return true;
  
  return requiredScopes.some(scope => hasScope(session, scope));
}
