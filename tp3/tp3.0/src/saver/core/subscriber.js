/**
 * ============================================================================
 * SAVER SUBSCRIBER
 * ============================================================================
 * Subscriber MQTT refactorizado usando arquitectura modular
 */

import mqtt from "mqtt";
import { createLogger } from "../../utils/logger.js";
import { validatePayload, extractMetadata } from "../core/validator.js";
import { FileStore } from "../core/file-store.js";

const logger = createLogger("SAVER-SUBSCRIBER");

/**
 * Subscriber MQTT refactorizado
 */
export class SaverSubscriber {
  constructor(config) {
    this.config = config;
    this.mqttClient = null;
    this.fileStore = null;
    this.isRunning = false;

    this.stats = {
      totalMessages: 0,
      savedImages: 0,
      errors: 0,
      duplicates: 0,
      lastProcessed: null,
      lastError: null,
      startTime: Date.now(),
    };
  }

  /**
   * Inicializa el subscriber
   */
  async start() {
    try {
      logger.info("Starting Saver Subscriber...");

      // Inicializar file store con configuración estructurada
      this.fileStore = new FileStore(this.config.storage);
      await this.fileStore.initialize();

      // Conectar a MQTT
      await this.connectMQTT();

      this.isRunning = true;
      logger.info(
        `Saver Subscriber started, listening on: ${this.config.mqtt.topic}`
      );

      // Configurar logging de estadísticas
      this.setupStatsLogging();
    } catch (error) {
      logger.error("Failed to start Saver Subscriber:", error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Conecta al broker MQTT
   */
  async connectMQTT() {
    logger.info(`Connecting to MQTT broker: ${this.config.mqtt.url}`);

    return new Promise((resolve, reject) => {
      this.mqttClient = mqtt.connect(this.config.mqtt.url, {
        clientId: this.config.mqtt.clientId,
        ...this.config.mqtt.options,
      });

      this.mqttClient.on("connect", () => {
        logger.info("Connected to MQTT broker");

        // Suscribirse al topic
        this.mqttClient.subscribe(
          this.config.mqtt.topic,
          { qos: this.config.mqtt.qos },
          (error) => {
            if (error) {
              logger.error("Failed to subscribe:", error);
              reject(error);
            } else {
              logger.info(`Subscribed to topic: ${this.config.mqtt.topic}`);
              resolve();
            }
          }
        );
      });

      this.mqttClient.on("message", (topic, payload) => {
        this.handleMessage(topic, payload);
      });

      this.mqttClient.on("error", (error) => {
        logger.error("MQTT error:", error);
        if (!this.mqttClient.connected) {
          reject(error);
        }
      });

      this.mqttClient.on("offline", () => {
        logger.warn("MQTT client offline");
      });

      this.mqttClient.on("reconnect", () => {
        logger.info("MQTT reconnecting...");
      });

      // Timeout de conexión
      const timeout = setTimeout(() => {
        if (!this.mqttClient.connected) {
          this.mqttClient.end();
          reject(new Error("MQTT connection timeout"));
        }
      }, this.config.mqtt.options.connectTimeout);

      this.mqttClient.on("connect", () => clearTimeout(timeout));
    });
  }

  /**
   * Maneja un mensaje MQTT
   */
  async handleMessage(topic, payload) {
    const startTime = Date.now();

    try {
      this.stats.totalMessages++;

      // Validar payload
      const validation = validatePayload(payload.toString());
      if (!validation.valid) {
        this.stats.errors++;
        logger.warn(`Invalid message from ${topic}: ${validation.error}`);
        return;
      }

      const message = JSON.parse(payload.toString());

      // Extraer metadatos
      const metadata = extractMetadata(message);

      // Decodificar imagen
      const imageBuffer = Buffer.from(message.data, "base64");

      // Guardar imagen usando file store
      const savedFile = await this.fileStore.saveImage(message, imageBuffer);

      if (savedFile.isDuplicate) {
        this.stats.duplicates++;
        logger.debug(`Duplicate image detected: ${savedFile.filename}`);
      } else if (savedFile.saved) {
        this.stats.savedImages++;
        logger.debug(
          `Image saved: ${savedFile.filename} (${imageBuffer.length} bytes)`
        );
      }

      // Actualizar estadísticas
      this.stats.lastProcessed = {
        timestamp: Date.now(),
        topic,
        cameraId: metadata.cameraId,
        filename: savedFile.filename,
        size: imageBuffer.length,
        duration: Date.now() - startTime,
      };

      logger.debug(
        `Message processed: topic=${topic}, ` +
          `camera=${metadata.cameraId}, duration=${Date.now() - startTime}ms`
      );
    } catch (error) {
      this.stats.errors++;
      this.stats.lastError = {
        timestamp: Date.now(),
        message: error.message,
        topic,
        payloadSize: payload.length,
        duration: Date.now() - startTime,
      };

      logger.error(`Failed to process message from ${topic}: ${error.message}`);
    }
  }

  /**
   * Detiene el subscriber
   */
  async stop() {
    logger.info("Stopping Saver Subscriber...");
    this.isRunning = false;

    try {
      // Desconectar MQTT
      if (this.mqttClient) {
        await new Promise((resolve) => {
          this.mqttClient.end(() => {
            logger.info("MQTT client disconnected");
            resolve();
          });
        });
      }

      // Limpiar intervalos
      if (this.statsInterval) {
        clearInterval(this.statsInterval);
      }

      logger.info("Saver Subscriber stopped");
    } catch (error) {
      logger.error("Error stopping subscriber:", error);
    }
  }

  /**
   * Obtiene estadísticas
   */
  getStats() {
    const uptime = Date.now() - this.stats.startTime;
    const fileStoreStats = this.fileStore?.getStats() || {};

    return {
      isRunning: this.isRunning,
      uptime,
      mqtt: {
        connected: this.mqttClient?.connected || false,
        topic: this.config.mqtt.topic,
      },
      messages: {
        total: this.stats.totalMessages,
        saved: this.stats.savedImages,
        duplicates: this.stats.duplicates,
        errors: this.stats.errors,
        successRate:
          this.stats.totalMessages > 0
            ? (
                ((this.stats.savedImages + this.stats.duplicates) /
                  this.stats.totalMessages) *
                100
              ).toFixed(1) + "%"
            : "0%",
      },
      storage: fileStoreStats,
      lastProcessed: this.stats.lastProcessed,
      lastError: this.stats.lastError,
    };
  }

  /**
   * Configura logging de estadísticas
   */
  setupStatsLogging() {
    this.statsInterval = setInterval(() => {
      const stats = this.getStats();
      logger.info(
        `Stats: ${stats.messages.total} msgs, ${stats.messages.saved} saved, ${stats.messages.errors} errors, ${stats.messages.successRate} success`
      );
    }, this.config.performance.statsIntervalMs);
  }

  /**
   * Manejo graceful de señales
   */
  setupGracefulShutdown() {
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      await this.stop();
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  }
}
