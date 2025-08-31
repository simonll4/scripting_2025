/**
 * ============================================================================
 * AUTHENTICATION UTILITIES
 * ============================================================================
 *
 * Servicios de autenticación y autorización.
 * Responsabilidades:
 * - Validación de tokens
 * - Gestión de sesiones
 * - Control de permisos/scopes
 */

import crypto from "crypto";
import argon2 from "argon2";
import { getTokenRowById } from "../../db/db.js";

/**
 * Valida un token de acceso
 * @param {Object} db - Instancia de base de datos
 * @param {string} tokenString - Token en formato "tokenId.secret"
 * @returns {Object|null} Datos del token válido o null si inválido
 */
export async function validateToken(db, tokenString) {
  // Parsear token: tokenId.secret
  const dotIndex = tokenString.indexOf(".");
  if (dotIndex <= 0) {
    return null; // Formato inválido
  }

  const tokenId = tokenString.slice(0, dotIndex);
  const secret = tokenString.slice(dotIndex + 1);

  // Obtener token de DB
  const tokenRow = await getTokenRowById(db, tokenId);
  if (!tokenRow) return null;

  // Verificar estado del token
  if (tokenRow.revoked) return null;
  if (tokenRow.expires_at && Date.now() > tokenRow.expires_at) return null;

  // Verificar secret con hash almacenado
  const isValidSecret = await argon2.verify(tokenRow.secretHash, secret);
  if (!isValidSecret) return null;

  return {
    tokenId,
    scopes: JSON.parse(tokenRow.scopes || "[]"),
  };
}

/**
 * Crea una nueva sesión de usuario
 * @param {Object} tokenData - Datos del token validado
 * @param {Object} socket - Socket TCP del cliente
 * @param {Object} sessions - Mapa global de sesiones
 * @returns {Object} Objeto de sesión creado
 */
export function createSession(tokenData, socket, sessions) {
  const sessionId = crypto.randomBytes(8).toString("hex");

  const session = {
    id: sessionId,
    ...tokenData,
    socket,
    createdAt: Date.now(),
    lastUsed: Date.now(),
  };

  sessions[sessionId] = session;
  return session;
}

/**
 * Verifica si una sesión tiene un scope específico
 * @param {Object} session - Objeto de sesión
 * @param {string} requiredScope - Scope requerido
 * @returns {boolean} true si tiene el scope
 */
export function hasScope(session, requiredScope) {
  const scopes = session?.scopes || [];

  // Scope wildcard (*) da acceso total
  if (scopes.includes("*")) return true;

  // Verificar scope específico
  return scopes.includes(requiredScope);
}

/**
 * Actualiza el timestamp de último uso de la sesión
 * @param {Object} session - Objeto de sesión
 */
export function touchSession(session) {
  if (session) {
    session.lastUsed = Date.now();
  }
}

/**
 * Limpia sesiones expiradas
 * @param {Object} sessions - Mapa de sesiones
 * @param {number} maxAge - Tiempo máximo sin uso (ms)
 * @returns {number} Cantidad de sesiones limpiadas
 */
export function cleanExpiredSessions(sessions, maxAge = 30 * 60 * 1000) {
  // 30 min default
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, session] of Object.entries(sessions)) {
    if (now - session.lastUsed > maxAge) {
      delete sessions[sessionId];
      cleaned++;
    }
  }

  return cleaned;
}
