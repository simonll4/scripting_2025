/**
 * Health Service
 * Monitorea estado del servidor y limpia sesiones expiradas
 */
import { logger } from "../utils/logger.js";

export class HealthService {
  constructor(connectionManager) {
    this.connectionManager = connectionManager;
    this.startTime = Date.now();
    this.logInterval = 20000; // 20 segundos
    this.cleanupInterval = 5 * 60 * 1000; // 5 minutos
    this.sessionMaxAge = 30 * 60 * 1000; // 30 minutos
    this.intervalId = null;
    this.cleanupIntervalId = null;
  }

  startMonitoring() {
    this.logStats();
    
    this.intervalId = setInterval(() => {
      this.logStats();
    }, this.logInterval);

    this.cleanupIntervalId = setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.cleanupInterval);
  }

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

  logStats() {
    const stats = this.getStats();
    logger.info(
      `Uptime: ${stats.uptime}s | Connections: ${stats.connections.active} | Sessions: ${stats.connections.sessions}`
    );
  }

  cleanupExpiredSessions() {
    const sessionsMap = this.connectionManager.sessions;
    const now = Date.now();
    let cleaned = 0;

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

  logConnectionEstablished(connection) {
    logger.info(
      `New connection: ${connection.id} from ${connection.socket.remoteAddress}:${connection.socket.remotePort}`
    );
  }

  logConnectionClosed(connection, reason = "unknown") {
    const duration = Date.now() - (connection.session?.createdAt || Date.now());
    const durationSec = Math.floor(duration / 1000);
    logger.info(
      `Connection closed: ${connection.id} | Duration: ${durationSec}s | Reason: ${reason}`
    );
  }

  getStats() {
    const uptime = Date.now() - this.startTime;
    return {
      uptime: Math.floor(uptime / 1000),
      connections: {
        active: this.connectionManager.connections.size,
        sessions: this.connectionManager.sessions.size,
      },
    };
  }
}
