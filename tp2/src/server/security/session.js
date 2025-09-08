/**
 * ============================================================================
 * SESSION SERVICE
 * ============================================================================
 *
 * Servicios stateless para gestión de sesiones.
 * Responsabilidades:
 * - Actualización de timestamps de sesión
 * - Limpieza de sesiones expiradas
 */

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
