/**
 * ============================================================================
 * SCHEDULER ENTRY POINT - Camera System TP3.0
 * ============================================================================
 * Punto de entrada principal del scheduler refactorizado con graceful shutdown
 */

import { Scheduler } from "./core/scheduler.js";
import { SCHEDULER_CONFIG as config } from "../shared/utils/config.js";
import { validateConfig, createLogger } from "../shared/utils/index.js";

const logger = createLogger("SCHEDULER-MAIN");

/**
 * Función principal
 */
async function main() {
  try {
    // Validar configuración crítica
    validateConfig(config, [
      "AGENT_HOST",
      "AGENT_PORT", 
      "TOKEN",
      "INTERVAL_MS",
    ]);

    logger.info("Starting Camera System Scheduler...");

    // Crear e inicializar scheduler
    const scheduler = new Scheduler(config);
    
    // Configurar cierre graceful
    setupGracefulShutdown(scheduler);
    
    // Iniciar scheduler
    await scheduler.start();
    
    logger.info("Scheduler is running. Press Ctrl+C to stop.");

  } catch (error) {
    logger.error("Failed to start scheduler:", error.message || error);
    if (error.stack) {
      logger.error("Stack trace:", error.stack);
    }
    process.exit(1);
  }
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
      logger.info("Final statistics:", {
        totalRequests: stats.totalRequests,
        successful: stats.successfulSnapshots,
        failed: stats.failedSnapshots,
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

export { Scheduler } from "./core/scheduler.js";
export { SchedulerClient } from "./core/client.js";
export { config } from "./config.js";
