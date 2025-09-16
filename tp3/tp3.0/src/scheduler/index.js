/**
 * ============================================================================
 * SCHEDULER ENTRY POINT
 * ============================================================================
 * Scheduler optimizado con arquitectura simplificada
 */

import { Scheduler } from "./core/scheduler.js";
import { config } from "./config.js";
import { createLogger } from '../utils/logger.js';

const logger = createLogger("SCHEDULER");

/**
 * Función principal optimizada
 */
async function main() {
  // Validar configuración esencial
  if (!config.TOKEN) {
    throw new Error("SCHEDULER_TOKEN is required");
  }

  logger.info("Starting optimized camera scheduler...");
  logger.info(
    `Config: ${config.DEFAULT_CAMERA} → ${config.DEFAULT_TOPIC} (${config.QUALITY_PRESET})`
  );

  // Crear scheduler optimizado
  const scheduler = new Scheduler(config);

  // Configurar shutdown graceful
  setupGracefulShutdown(scheduler);

  // Iniciar
  await scheduler.start();

  // Log estadísticas cada minuto
  setInterval(() => {
    const stats = scheduler.getStats();
    logger.info("Stats:", {
      uptime: Math.round(stats.uptime / 1000) + "s",
      total: stats.totalRequests,
      success: stats.successful,
      failed: stats.failed,
      rate: stats.successRate,
    });
  }, 60000);

  logger.info("Optimized scheduler running. Press Ctrl+C to stop.");
}

/**
 * Manejo graceful de señales
 */
function setupGracefulShutdown(scheduler) {
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    try {
      await scheduler.stop();

      // Mostrar estadísticas finales
      const stats = scheduler.getStats();
      logger.info("Final stats:", {
        total: stats.totalRequests,
        success: stats.successful,
        failed: stats.failed,
        uptime: Math.round(stats.uptime / 1000) + "s",
      });

      process.exit(0);
    } catch (error) {
      logger.error("Error during shutdown:", error);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  // Manejar errores no capturados
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception:", error);
    shutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled rejection at:", promise, "reason:", reason);
    shutdown("unhandledRejection");
  });
}

// Ejecutar si es el módulo principal
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error("Unhandled error:", error);
    process.exit(1);
  });
}
