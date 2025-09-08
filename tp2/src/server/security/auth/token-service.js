/**
 * ============================================================================
 * TOKEN SERVICE (refactor)
 * ============================================================================
 * Responsabilidades:
 * - Validación de tokens contra base de datos
 * - Verificación de scopes/permisos
 * - Detección de tokens expirados/revocados
 * Contrato de salida:
 * - { ok: true, tokenId, scopes, expiresAt? }
 * - { ok: false, reason: 'not_found'|'revoked'|'expired'|'invalid_secret', expiresAt? }
 */
import argon2 from "argon2";
import { getTokenRowById } from "../../db/db.js";

/**
 * Valida un token "tokenId.secret"
 * @returns {{ok:true, tokenId:string, scopes:string[], expiresAt?:number} |
 *           {ok:false, reason:'not_found'|'revoked'|'expired'|'invalid_secret', expiresAt?:number}}
 */
export async function validateToken(db, tokenString) {
  // 1) Parseo básico
  const dotIndex = tokenString.indexOf(".");
  if (dotIndex <= 0) {
    return { ok: false, reason: "not_found" }; // formato inválido => como si no existiera
  }
  const tokenId = tokenString.slice(0, dotIndex);
  const secret = tokenString.slice(dotIndex + 1);

  // 2) Lookup DB
  const row = await getTokenRowById(db, tokenId);
  if (!row) return { ok: false, reason: "not_found" };

  // 3) Estado
  if (row.revoked) return { ok: false, reason: "revoked" };

  if (row.expires_at && Date.now() > row.expires_at) {
    return { ok: false, reason: "expired", expiresAt: row.expires_at };
  }

  // 4) Secreto
  const ok = await argon2.verify(row.secretHash, secret);
  if (!ok) return { ok: false, reason: "invalid_secret" };

  // 5) OK
  return {
    ok: true,
    tokenId,
    scopes: JSON.parse(row.scopes || "[]"),
    expiresAt: row.expires_at || undefined,
  };
}

/** Scope check sencillo (incluye wildcard '*') */
export function hasScope(session, requiredScope) {
  const scopes = session?.scopes || [];
  if (scopes.includes("*")) return true;
  return scopes.includes(requiredScope);
}

// /**
//  * ============================================================================
//  * TOKEN SERVICE
//  * ============================================================================
//  *
//  * Servicios de validación de tokens y control de permisos/scopes.
//  * Responsabilidades:
//  * - Validación de tokens contra base de datos
//  * - Verificación de scopes/permisos
//  * - Detección de tokens expirados/revocados
//  */

// import argon2 from "argon2";
// import { getTokenRowById } from "../../db/db.js";

// /**
//  * Valida un token de acceso
//  * @param {Object} db - Instancia de base de datos
//  * @param {string} tokenString - Token en formato "tokenId.secret"
//  * @returns {Object|null} Datos del token válido o null si inválido
//  */
// export async function validateToken(db, tokenString) {
//   // Parsear token: tokenId.secret
//   const dotIndex = tokenString.indexOf(".");
//   if (dotIndex <= 0) {
//     return null; // Formato inválido
//   }

//   const tokenId = tokenString.slice(0, dotIndex);
//   const secret = tokenString.slice(dotIndex + 1);

//   // Obtener token de DB
//   const tokenRow = await getTokenRowById(db, tokenId);
//   if (!tokenRow) return null;

//   // Verificar estado del token
//   if (tokenRow.revoked) return { invalid: true, reason: "revoked" };

//   // Verificar expiración
//   if (tokenRow.expires_at && Date.now() > tokenRow.expires_at) {
//     return {
//       invalid: true,
//       expired: true,
//       reason: "expired",
//       expiresAt: tokenRow.expires_at
//     };
//   }

//   // Verificar secret con hash almacenado
//   const isValidSecret = await argon2.verify(tokenRow.secretHash, secret);
//   if (!isValidSecret) return { invalid: true, reason: "invalid_secret" };

//   return {
//     tokenId,
//     scopes: JSON.parse(tokenRow.scopes || "[]"),
//     expiresAt: tokenRow.expires_at,
//   };
// }

// /**
//  * Verifica si una sesión tiene un scope específico
//  * @param {Object} session - Objeto de sesión
//  * @param {string} requiredScope - Scope requerido
//  * @returns {boolean} true si tiene el scope
//  */
// export function hasScope(session, requiredScope) {
//   const scopes = session?.scopes || [];

//   // Scope wildcard (*) da acceso total
//   if (scopes.includes("*")) return true;

//   // Verificar scope específico
//   return scopes.includes(requiredScope);
// }
