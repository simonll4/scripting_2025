import { start } from "./core/app.js";
import { logger } from "./utils/logger.js";

/**
 * Función principal del cliente CLP
 */
async function main() {
  let clpServices = null;
  
  // Graceful shutdown handler
  const gracefulShutdown = (signal) => {
    logger.info("shutdown_signal_received", { signal });
    
    if (clpServices) {
      console.log("¡Hasta luego!");
      clpServices.cleanup();
    }
    
    if (clpServices?.client) {
      clpServices.client.end(true, () => {
        logger.info("clp_shutdown", { agent: clpServices.agentName });
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
    // Iniciar el cliente CLP
    clpServices = await start();
    
    logger.info("CLP client started successfully");
  } catch (error) {
    logger.error("Failed to start CLP client:", { message: error?.message, stack: error?.stack });
    process.exit(1);
  }
}

// Ejecutar si es el módulo principal
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error("Unhandled error:", { message: error?.message, stack: error?.stack });
    process.exit(1);
  });
}
