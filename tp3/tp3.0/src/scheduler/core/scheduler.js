/**
 * ============================================================================
 * SCHEDULER MAIN - Camera System TP3.0
 * ============================================================================
 * Scheduler principal refactorizado usando el nuevo cliente
 */

import { SchedulerClient } from "./client.js";
import { createLogger } from "../../utils/logger.js";

const logger = createLogger("SCHEDULER");

/**
 * Scheduler principal refactorizado
 */
export class Scheduler {
  constructor(config) {
    this.config = config;
    this.client = new SchedulerClient(config);
    this.intervalId = null;
    this.isRunning = false;
    this.isExecuting = false;
    this.statsIntervalId = null;
    
    this.stats = {
      totalRequests: 0,
      successfulSnapshots: 0,
      failedSnapshots: 0,
      lastSnapshot: null,
      lastError: null,
      startTime: null,
      connectionErrors: 0,
    };
  }

  /**
   * Inicia el scheduler
   */
  async start() {
    if (this.isRunning) {
      logger.warn("Scheduler is already running");
      return;
    }

    try {
      logger.info(`Starting scheduler with interval: ${this.config.INTERVAL_MS}ms`);
      
      this.stats.startTime = Date.now();
      this.isRunning = true;

      // Conectar inicial
      await this.client.connect();
      
      // Iniciar ciclo de snapshots
      this.intervalId = setInterval(() => {
        this.executeSnapshot().catch((error) => {
          logger.error("Snapshot execution error:", error);
        });
      }, this.config.INTERVAL_MS);

      // Iniciar logging de estadísticas
      this.startStatsLogging();

      logger.info("Scheduler started successfully");
      
    } catch (error) {
      this.isRunning = false;
      logger.error("Failed to start scheduler:", error);
      throw error;
    }
  }

  /**
   * Ejecuta captura de snapshot
   */
  async executeSnapshot() {
    if (this.isExecuting) {
      logger.debug("Snapshot already in progress, skipping");
      return;
    }

    this.isExecuting = true;
    this.stats.totalRequests++;

    try {
      logger.debug("Executing snapshot request...");
      
      const startTime = Date.now();
      const response = await this.client.requestSnapshot({
        cameraId: this.config.DEFAULT_CAMERA,
        topic: this.config.DEFAULT_TOPIC,
      });

      const duration = Date.now() - startTime;
      
      this.stats.successfulSnapshots++;
      this.stats.lastSnapshot = {
        timestamp: Date.now(),
        duration,
        size: response.data?.size,
        cameraId: response.data?.cameraId,
        topic: response.data?.topic,
      };

      logger.info(`Snapshot captured successfully in ${duration}ms:`, {
        size: response.data?.size,
        cameraId: response.data?.cameraId,
        topic: response.data?.topic,
      });

    } catch (error) {
      this.stats.failedSnapshots++;
      this.stats.lastError = {
        timestamp: Date.now(),
        message: error.message,
        code: error.code,
      };

      // Distinguir entre errores de conexión y errores de negocio
      if (error.message.includes("connect") || error.message.includes("timeout")) {
        this.stats.connectionErrors++;
        logger.error("Connection error during snapshot:", error.message);
      } else {
        logger.error("Snapshot request failed:", error.message);
      }

    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Inicia logging periódico de estadísticas
   */
  startStatsLogging() {
    this.statsIntervalId = setInterval(() => {
      this.logStats();
    }, this.config.STATS_LOG_INTERVAL_MS || 60000);
  }

  /**
   * Log de estadísticas
   */
  logStats() {
    const uptime = Date.now() - this.stats.startTime;
    const successRate = this.stats.totalRequests > 0 
      ? ((this.stats.successfulSnapshots / this.stats.totalRequests) * 100).toFixed(2)
      : 0;

    const connectionStats = this.client.getConnectionStats();

    logger.info("Scheduler Statistics:", {
      uptime: Math.round(uptime / 1000) + "s",
      totalRequests: this.stats.totalRequests,
      successful: this.stats.successfulSnapshots,
      failed: this.stats.failedSnapshots,
      successRate: `${successRate}%`,
      connectionErrors: this.stats.connectionErrors,
      connection: {
        connected: connectionStats.connected,
        authenticated: connectionStats.authenticated,
        pendingRequests: connectionStats.pendingRequests,
        retryCount: connectionStats.retryCount,
      },
      lastSnapshot: this.stats.lastSnapshot?.timestamp 
        ? new Date(this.stats.lastSnapshot.timestamp).toISOString()
        : null,
    });
  }

  /**
   * Lista cámaras disponibles
   */
  async listCameras() {
    try {
      const response = await this.client.listCameras();
      return response.data?.cameras || [];
    } catch (error) {
      logger.error("Failed to list cameras:", error);
      throw error;
    }
  }

  /**
   * Detiene el scheduler
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info("Stopping scheduler...");
    this.isRunning = false;

    // Limpiar intervalos
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.statsIntervalId) {
      clearInterval(this.statsIntervalId);
      this.statsIntervalId = null;
    }

    // Desconectar cliente
    await this.client.disconnect();

    logger.info("Scheduler stopped");
  }

  /**
   * Obtiene estadísticas completas
   */
  getStats() {
    const connectionStats = this.client.getConnectionStats();
    
    return {
      ...this.stats,
      uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0,
      isRunning: this.isRunning,
      isExecuting: this.isExecuting,
      connection: connectionStats,
    };
  }
}
