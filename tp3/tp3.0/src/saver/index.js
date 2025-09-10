/**
 * ============================================================================
 * SAVER MAIN - Camera System TP3.0
 * ============================================================================
 * Punto de entrada principal del saver refactorizado
 */

import { SaverSubscriber } from "./core/subscriber.js";
import { SAVER_CONFIG as config } from "../shared/utils/config.js";
import { validateConfig, createLogger } from "../shared/utils/index.js";

const logger = createLogger("SAVER-MAIN");

/**
 * Manejo graceful de señales
 */
async function setupGracefulShutdown(saver) {
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    try {
      await saver.stop();
      
      // Mostrar estadísticas finales
      const stats = saver.getStats();
      logger.info("Final statistics:", JSON.stringify(stats, null, 2));
      
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

/**
 * Mostrar estadísticas periódicamente
 */
function setupStatsReporting(saver) {
  setInterval(() => {
    const stats = saver.getStats();
    if (stats.totalMessages > 0) {
      logger.info(
        `Stats: messages=${stats.totalMessages}, saved=${stats.savedImages}, ` +
        `errors=${stats.errors}, rate=${stats.successRate.toFixed(1)}%, ` +
        `avgSize=${stats.avgImageSize}B, totalMB=${(stats.totalBytes / 1024 / 1024).toFixed(1)}`
      );
    }
  }, 60000); // Cada minuto
}

/**
 * Función principal
 */
async function main() {
  try {
    // Validar configuración crítica
    validateConfig(config, [
      "MQTT_URL",
      "SUB_TOPIC", 
      "OUT_DIR",
    ]);

    // Adaptar configuración flat a nested
    const saverConfig = {
      mqtt: {
        broker: config.MQTT_URL ? new URL(config.MQTT_URL).hostname : "localhost",
        port: config.MQTT_URL ? (parseInt(new URL(config.MQTT_URL).port) || 1883) : 1883,
        clientId: `saver-${Date.now()}`,
        topic: config.SUB_TOPIC || "camera/snapshots",
        qos: 1,
        options: {
          username: config.MQTT_USER,
          password: config.MQTT_PASS,
          keepalive: 60,
          connectTimeout: 30000,
          reconnectPeriod: 5000,
          clean: true,
        }
      },
      storage: {
        OUT_DIR: config.OUT_DIR || "./snapshots",
        MAX_FILE_SIZE: 2 * 1024 * 1024, // 2MB
      },
      validation: {
        MAX_IMAGE_SIZE: 2 * 1024 * 1024,
        ALLOWED_FORMATS: ["image/jpeg"],
        ALLOWED_ENCODINGS: ["base64"],
      }
    };

    // Crear instancia del saver refactorizado
    const saver = new SaverSubscriber(saverConfig);

    // Configurar shutdown graceful
    saver.setupGracefulShutdown();

    // Iniciar el saver
    await saver.start();

    // Log estadísticas inicial
    const stats = saver.getStats();
    logger.info("Saver started successfully:", {
      mqtt: stats.mqtt,
      storage: stats.storage,
    });

    logger.info("Saver is running. Press Ctrl+C to stop.");

  } catch (error) {
    logger.error("Failed to start Saver:", error.message || error);
    if (error.stack) {
      logger.error("Stack trace:", error.stack);
    }
    process.exit(1);
  }
}

// Ejecutar si es el módulo principal
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error("Unhandled error:", error);
    process.exit(1);
  });
}

export { SaverSubscriber } from "./core/subscriber.js";
export { saverConfig as config } from "./config.js";
