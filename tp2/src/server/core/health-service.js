/**
 * Health Monitoring and Session Management Service
 *
 * IDEA GENERAL:
 * Este módulo implementa un servicio de monitoreo del estado del servidor que realiza
 * dos funciones principales:
 * 1. Logging automático de estadísticas del servidor (uptime, conexiones activas, sesiones)
 * 2. Limpieza automática de sesiones expiradas por inactividad
 *
 * El servicio funciona de manera autónoma mediante intervalos configurables:
 * - Cada 20 segundos registra estadísticas de salud en consola
 * - Cada 5 minutos limpia sesiones inactivas (>30 min sin uso)
 * - Proporciona logging detallado de eventos de conexión/desconexión
 *
 * Es esencial para mantener el servidor limpio y monitorear su estado operativo.
 */
import { logger } from "../utils/logger.js";

export class HealthService {
  constructor(connectionManager, logInterval = 20000) {
    this.connectionManager = connectionManager;
    this.startTime = Date.now();
    this.logInterval = logInterval; // Intervalo para logging de stats (default: 20s)
    this.cleanupInterval = 5 * 60 * 1000; // Intervalo para limpieza de sesiones (5 min)
    this.sessionMaxAge = 30 * 60 * 1000; // Tiempo máximo de inactividad (30 min)
    this.intervalId = null;
    this.cleanupIntervalId = null;
  }

  /**
   * Inicia el logging automático del estado del servidor y limpieza de sesiones
   */
  startMonitoring() {
    this.logStats(); // Log inicial

    // Inicia el logging periódico de estadísticas de salud
    this.intervalId = setInterval(() => {
      this.logStats();
    }, this.logInterval);

    // Inicia la limpieza periódica de sesiones expiradas
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.cleanupInterval);
  }

  /**
   * Detiene el logging automático y limpieza de sesiones
   */
  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }

    logger.info("Health monitoring stopped");
  }

  /**
   * Registra estadísticas del servidor en consola
   */
  logStats() {
    const stats = this.getStats();
    const uptimeSec = stats.uptime;

    logger.info(
      `Uptime: ${uptimeSec}s | Connections: ${stats.connections.active} | Sessions: ${stats.connections.sessions}`
    );
  }

  /**
   * Limpia sesiones expiradas por inactividad
   */
  cleanupExpiredSessions() {
    const sessionsMap = this.connectionManager.sessions;
    const now = Date.now();
    let cleaned = 0;

    // Itera sobre el Map de sesiones y elimina las expiradas
    for (const [sessionId, session] of sessionsMap.entries()) {
      if (now - session.lastUsed > this.sessionMaxAge) {
        sessionsMap.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(
        `Removed ${cleaned} expired sessions (inactive > ${
          this.sessionMaxAge / 60000
        }min)`
      );
    }
  }

  /**
   * Log cuando una nueva conexión se establece
   */
  logConnectionEstablished(connection) {
    logger.info(
      `New connection established: ${connection.id} from ${connection.socket.remoteAddress}:${connection.socket.remotePort}`
    );
  }

  /**
   * Log cuando una conexión se cierra
   */
  logConnectionClosed(connection, reason = "unknown") {
    const duration = Date.now() - (connection.session?.createdAt || Date.now());
    const durationSec = Math.floor(duration / 1000);
    logger.info(
      `Connection closed: ${connection.id} | Duration: ${durationSec}s | Reason: ${reason}`
    );
  }

  /**
   * Obtiene estadísticas actuales del servidor
   * @returns {Object} Objeto con uptime y información de conexiones/sesiones
   */
  getStats() {
    const now = Date.now();
    const uptime = now - this.startTime;

    return {
      uptime: Math.floor(uptime / 1000), // Tiempo de funcionamiento en segundos
      connections: {
        active: this.connectionManager.connections.size,
        sessions: this.connectionManager.sessions.size,
      },
    };
  }
}
