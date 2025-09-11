import { SaverSubscriber } from "./core/subscriber.js";
import { config } from "./config.js";
import { createLogger } from "../utils/index.js";

const logger = createLogger("SAVER-MAIN");


/**
 * Función principal
 */
async function main() {
  try {
    // Validar configuración crítica
    if (!config.MQTT_URL || !config.SUB_TOPIC || !config.OUT_DIR) {
      throw new Error("Missing required configuration");
    }

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
export { config } from "./config.js";
