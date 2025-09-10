/**
 * ============================================================================
 * CAPTURES REPOSITORY - Camera System TP3.0
 * ============================================================================
 * Repositorio para manejo de logs de capturas
 */

/**
 * Registra una captura en el log
 */
export async function logCapture(db, { 
  cameraId, 
  topic, 
  success, 
  errorMsg = null, 
  imageSize = null, 
  clientIp = null 
}) {
  await db.run(
    `INSERT INTO capture_logs (timestamp, camera_id, topic, success, error_msg, image_size, client_ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [Date.now(), cameraId, topic, success ? 1 : 0, errorMsg, imageSize, clientIp]
  );
}

/**
 * Obtiene estadísticas de capturas
 */
export async function getCaptureStats(db, { cameraId = null, since = null } = {}) {
  let query = `
    SELECT 
      COUNT(*) as total,
      SUM(success) as successful,
      COUNT(*) - SUM(success) as failed,
      AVG(image_size) as avg_size,
      MAX(timestamp) as last_capture
    FROM capture_logs
  `;
  
  const params = [];
  const conditions = [];
  
  if (cameraId) {
    conditions.push("camera_id = ?");
    params.push(cameraId);
  }
  
  if (since) {
    conditions.push("timestamp >= ?");
    params.push(since);
  }
  
  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }
  
  return db.get(query, params);
}

/**
 * Obtiene capturas recientes
 */
export async function getRecentCaptures(db, { 
  limit = 50, 
  cameraId = null, 
  successOnly = false 
} = {}) {
  let query = `
    SELECT timestamp, camera_id, topic, success, error_msg, image_size, client_ip
    FROM capture_logs
  `;
  
  const params = [];
  const conditions = [];
  
  if (cameraId) {
    conditions.push("camera_id = ?");
    params.push(cameraId);
  }
  
  if (successOnly) {
    conditions.push("success = 1");
  }
  
  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }
  
  query += " ORDER BY timestamp DESC LIMIT ?";
  params.push(limit);
  
  return db.all(query, params);
}

/**
 * Limpia logs antiguos
 */
export async function cleanupOldCaptures(db, olderThanMs) {
  const cutoff = Date.now() - olderThanMs;
  const result = await db.run(
    `DELETE FROM capture_logs WHERE timestamp < ?`,
    [cutoff]
  );
  return result.changes;
}
