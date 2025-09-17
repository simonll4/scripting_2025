/**
 * ============================================================================
 * Scheduler
 * ============================================================================
 */

import { SchedulerClient } from "./client.js";
import { createLogger } from "../../../utils/logger.js";

const logger = createLogger("SCHEDULER");

/**
 * Scheduler optimizado usando cliente robusto
 */
export class Scheduler {
  constructor(config) {
    this.config = config;
    this.client = new SchedulerClient(config);
    this.intervalId = null;
    this.isRunning = false;
    this.isExecuting = false;

    // Stats simplificadas
    this.stats = {
      totalRequests: 0,
      successful: 0,
      failed: 0,
      startTime: null,
      lastSnapshot: null,
      lastError: null,
    };
  }

  /**
   * Inicia el scheduler optimizado
   */
  async start() {
    if (this.isRunning) {
      logger.warn("Scheduler already running");
      return;
    }

    logger.info(
      `Starting optimized scheduler (${this.config.INTERVAL_MS}ms interval)`
    );

    this.stats.startTime = Date.now();
    this.isRunning = true;

    // Conectar usando el cliente robusto
    await this.client.connect();

    // Iniciar ciclo de snapshots
    this.intervalId = setInterval(() => {
      this.executeSnapshot().catch((error) => {
        logger.error("Snapshot error:", error.message);
      });
    }, this.config.INTERVAL_MS);

    logger.info("Optimized scheduler started");
  }

  /**
   * Captura snapshot usando el cliente robusto
   */
  async executeSnapshot() {
    if (this.isExecuting) {
      logger.debug("Snapshot in progress, skipping");
      return;
    }

    this.isExecuting = true;
    this.stats.totalRequests++;

    try {
      const startTime = Date.now();

      const response = await this.client.requestSnapshot({
        cameraId: this.config.DEFAULT_CAMERA,
        topic: this.config.DEFAULT_TOPIC,
        width: this.config.WIDTH,
        height: this.config.HEIGHT,
        quality: this.config.QUALITY,
        qualityPreset: this.config.QUALITY_PRESET,
      });

      const duration = Date.now() - startTime;

      this.stats.successful++;
      this.stats.lastSnapshot = {
        timestamp: Date.now(),
        duration,
        size: response.data?.size,
        width: response.data?.width,
        height: response.data?.height,
      };

      logger.info(`Snapshot OK: ${response.data?.size}B in ${duration}ms`);
    } catch (error) {
      this.stats.failed++;
      this.stats.lastError = {
        timestamp: Date.now(),
        message: error.message,
      };

      logger.error("Snapshot failed:", error.message);
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Detiene el scheduler
   */
  async stop() {
    if (!this.isRunning) return;

    logger.info("Stopping optimized scheduler...");
    this.isRunning = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    await this.client.disconnect();
    logger.info("Optimized scheduler stopped");
  }

  /**
   * Obtiene estadísticas
   */
  getStats() {
    const uptime = this.stats.startTime ? Date.now() - this.stats.startTime : 0;
    const successRate =
      this.stats.totalRequests > 0
        ? ((this.stats.successful / this.stats.totalRequests) * 100).toFixed(1)
        : 0;

    const clientStats = this.client.getConnectionStats();

    return {
      ...this.stats,
      uptime,
      successRate: `${successRate}%`,
      isRunning: this.isRunning,
      isExecuting: this.isExecuting,
      connection: clientStats,
    };
  }
}
