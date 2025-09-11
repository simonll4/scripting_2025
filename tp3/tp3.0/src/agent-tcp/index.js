import { AgentTCPServer } from "./core/server.js";
import { config } from "./config.js";
import { createLogger } from "../utils/index.js";

const logger = createLogger("AGENT-TCP-MAIN");

/**
 * Función principal
 */
async function main() {
  try {
    // Validar configuración crítica
    if (!config.TCP_PORT || !config.MQTT_URL || !config.DEFAULT_CAMERA || !config.DB_PATH) {
      throw new Error("Missing required configuration");
    }

    // Crear e inicializar servidor
    const server = new AgentTCPServer(config);
    
    // Configurar cierre graceful
    server.setupGracefulShutdown();
    
    // Iniciar servidor
    await server.start();
    
    // Log de estadísticas inicial
    const stats = server.getStats();
    logger.info("Server started successfully:", stats);

    // Opcional: Log estadísticas cada minuto
    setInterval(() => {
      const currentStats = server.getStats();
      logger.debug("Server stats:", currentStats);
    }, 60000);

  } catch (error) {
    logger.error("Failed to start agent-tcp:", error);
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

export { AgentTCPServer } from "./core/server.js";
export { config } from "./config.js";
