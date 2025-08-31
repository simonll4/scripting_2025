/**
 * Health Monitoring and Logging Service
 * Registra información del estado del servidor en consola
 */
export class HealthService {
  constructor(connectionManager, logInterval = 20000) {
    // 20 segundos por defecto
    this.connectionManager = connectionManager;
    this.startTime = Date.now();
    this.logInterval = logInterval;
    this.intervalId = null;
  }

  /**
   * Inicia el logging automático del estado del servidor
   */
  startMonitoring() {
    // console.log("Health monitoring started");
    this.logStats(); // Log inicial

    this.intervalId = setInterval(() => {
      this.logStats();
    }, this.logInterval);
  }

  /**
   * Detiene el logging automático
   */
  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("🔍 Health monitoring stopped");
    }
  }

  /**
   * Registra estadísticas del servidor en consola
   */
  logStats() {
    const stats = this.getStats();
    const uptimeSec = stats.uptime;

    console.log(
      `[HEALTH] Uptime: ${uptimeSec}s | Connections: ${stats.connections.active} | Sessions: ${stats.connections.sessions}`
    );
  }

  /**
   * TODO: logConnectionDetails - Detailed connection logging - Not used anywhere
   * Could be used for debugging or admin panel
   */
  // logConnectionDetails() {
  //   const details = this.getConnectionDetails();
  //   console.log(`[CONNECTIONS] Total active: ${details.total}`);

  //   if (details.total > 0) {
  //     details.connections.forEach((conn) => {
  //       const connectedTime = Math.floor(conn.connected / 1000);
  //       console.log(
  //         `  └─ ID: ${conn.id} | Session: ${conn.sessionId || "none"} | From: ${
  //           conn.remoteAddress
  //         }:${conn.remotePort} | Time: ${connectedTime}s`
  //       );
  //     });
  //   }
  // }

  /**
   * Log cuando una nueva conexión se establece
   */
  logConnectionEstablished(connection) {
    console.log(
      `[CONNECTION] New connection established: ${connection.id} from ${connection.socket.remoteAddress}:${connection.socket.remotePort}`
    );
  }

  /**
   * Log cuando una conexión se cierra
   */
  logConnectionClosed(connection, reason = "unknown") {
    const duration = Date.now() - (connection.session?.createdAt || Date.now());
    const durationSec = Math.floor(duration / 1000);
    console.log(
      `[CONNECTION] Connection closed: ${connection.id} | Duration: ${durationSec}s | Reason: ${reason}`
    );
  }

  /**
   * TODO: logMemoryWarning - Memory usage monitoring - Not used anywhere
   * Could be useful for production monitoring
   */
  // logMemoryWarning() {
  //   const stats = this.getStats();
  //   const memoryMB = Math.round(stats.memory.heapUsed / 1024 / 1024);

  //   if (memoryMB > 100) {
  //     // Más de 100MB
  //     console.warn(`[MEMORY] High memory usage detected: ${memoryMB}MB`);
  //   }
  // }

  getStats() {
    const now = Date.now();
    const uptime = now - this.startTime;

    return {
      uptime: Math.floor(uptime / 1000), // seconds
      connections: {
        active: this.connectionManager.connections.size,
        sessions: this.connectionManager.sessions.size,
      },
      memory: process.memoryUsage(),
      system: {
        platform: process.platform,
        nodeVersion: process.version,
        pid: process.pid,
      },
      timestamp: now,
    };
  }

  // TODO: getConnectionDetails - Connection details builder - Only used by commented logConnectionDetails
  // Could be useful for admin monitoring features
  // getConnectionDetails() {
  //   const connections = Array.from(
  //     this.connectionManager.connections.values()
  //   ).map((conn) => ({
  //     id: conn.id,
  //     sessionId: conn.session?.id || null,
  //     scopes: conn.session?.scopes || [],
  //     connected: Date.now() - (conn.session?.createdAt || Date.now()),
  //     remoteAddress: conn.socket.remoteAddress,
  //     remotePort: conn.socket.remotePort,
  //   }));

  //   return { connections, total: connections.length };
  // }
}
