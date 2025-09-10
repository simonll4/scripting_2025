/**
 * ============================================================================
 * TOKENS REPOSITORY - Camera System TP3.0
 * ============================================================================
 * Repositorio para manejo de tokens de autenticación
 */

/**
 * Obtiene un token por ID
 */
export async function getTokenById(db, tokenId) {
  return db.get(
    `SELECT tokenId, secretHash, scopes, expires_at, revoked
     FROM tokens 
     WHERE tokenId = ?`,
    [tokenId]
  );
}

/**
 * Crea un nuevo token
 */
export async function createToken(db, { tokenId, secretHash, scopes = [], expiresAt = null }) {
  await db.run(
    `INSERT INTO tokens (tokenId, secretHash, scopes, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [tokenId, secretHash, JSON.stringify(scopes), Date.now(), expiresAt]
  );
}

/**
 * Revoca un token
 */
export async function revokeToken(db, tokenId) {
  await db.run(
    `UPDATE tokens SET revoked = 1 WHERE tokenId = ?`,
    [tokenId]
  );
}

/**
 * Lista todos los tokens (para admin)
 */
export async function listTokens(db, { includeRevoked = false } = {}) {
  const whereClause = includeRevoked ? "" : "WHERE revoked = 0";
  return db.all(`
    SELECT tokenId, scopes, created_at, expires_at, revoked
    FROM tokens 
    ${whereClause}
    ORDER BY created_at DESC
  `);
}

/**
 * Limpia tokens expirados
 */
export async function cleanupExpiredTokens(db) {
  const now = Date.now();
  const result = await db.run(
    `DELETE FROM tokens WHERE expires_at IS NOT NULL AND expires_at < ?`,
    [now]
  );
  return result.changes;
}
