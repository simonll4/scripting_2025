import { SaverSubscriber } from "./core/subscriber.js";
import { config } from "./config.js";
import { createLogger } from "../../utils/index.js";

const logger = createLogger("SAVER-MAIN");

/**
 * Función principal del servicio Saver
 */
async function main() {
  try {
    logger.info("Starting Saver service...");

    // Crear instancia del saver
    const saver = new SaverSubscriber(config);

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
