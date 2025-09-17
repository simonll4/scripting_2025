import { start } from "./core/app.js";
import { logger } from "./utils/logger.js";

/**
 * Función principal del agente
 */
async function main() {
  let agentServices = null;

  // Graceful shutdown handler
  const gracefulShutdown = (signal) => {
    logger.info("shutdown_signal_received", { signal });

    if (agentServices) {
      agentServices.cleanup();
    }

    if (agentServices?.client) {
      agentServices.client.end(false, () => {
        logger.info("mqtt_client_closed");
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  };

  // Setup signal handlers
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

  try {
    // Iniciar el agente
    agentServices = await start();

    logger.info("Agent started successfully");
  } catch (error) {
    logger.error("Failed to start agent:", {
      message: error?.message,
      stack: error?.stack,
    });
    process.exit(1);
  }
}

// Ejecutar si es el módulo principal
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error("Unhandled error:", {
      message: error?.message,
      stack: error?.stack,
    });
    process.exit(1);
  });
}
