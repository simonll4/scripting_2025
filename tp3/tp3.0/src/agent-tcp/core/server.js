/**
 * ============================================================================
 * AGENT TCP SERVER - Camera System TP3.0
 * ============================================================================
 * Servidor TCP refactorizado siguiendo la arquitectura de tp2
 */

import net from "net";
import { createLogger } from "../../shared/utils/logger.js";
import { ConnectionManager } from "./connection-manager.js";
import { MessagePipeline } from "./message-pipeline.js";
import { initDB } from "../db/index.js";
import { MQTTAdapter } from "../adapters/mqtt.js";

const logger = createLogger("AGENT-TCP-SERVER");

/**
 * Servidor TCP principal
 */
export class AgentTCPServer {
  constructor(config) {
    this.config = config;
    this.server = null;
    this.db = null;
    this.mqttAdapter = null;
    this.connectionManager = null;
    this.messagePipeline = null;
    this.captureQueue = new Map(); // Para evitar capturas concurrentes por cámara
    this.isRunning = false;
  }

  /**
   * Inicializa el servidor
   */
  async start() {
    try {
      logger.info("Starting AgentTCP server...");

      // Inicializar base de datos
      this.db = await initDB(this.config.DB_PATH);
      logger.info("Database initialized");

      // Conectar a MQTT
      this.mqttAdapter = new MQTTAdapter(this.config);
      await this.mqttAdapter.connect();
      logger.info("MQTT adapter connected");

      // Inicializar gestores
      this.connectionManager = new ConnectionManager(this.config);
      this.messagePipeline = new MessagePipeline({
        db: this.db,
        mqttAdapter: this.mqttAdapter,
        captureQueue: this.captureQueue,
        config: this.config,
      });

      // Crear servidor TCP
      this.server = net.createServer((socket) => {
        this.connectionManager.handleConnection(socket, this.messagePipeline);
      });

      // Configurar eventos del servidor
      this.server.on("error", (error) => {
        logger.error("Server error:", error);
      });

      // Iniciar escucha
      await new Promise((resolve, reject) => {
        this.server.listen(this.config.TCP_PORT, (error) => {
          if (error) {
            reject(error);
          } else {
            this.isRunning = true;
            logger.info(`AgentTCP listening on port ${this.config.TCP_PORT}`);
            resolve();
          }
        });
      });

    } catch (error) {
      logger.error("Failed to start AgentTCP:", error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Detiene el servidor
   */
  async stop() {
    logger.info("Stopping AgentTCP server...");
    this.isRunning = false;

    try {
      // Cerrar conexiones
      if (this.connectionManager) {
        this.connectionManager.closeAllConnections();
      }

      // Cerrar servidor TCP
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(() => {
            logger.info("TCP server closed");
            resolve();
          });
        });
      }

      // Desconectar MQTT
      if (this.mqttAdapter) {
        await this.mqttAdapter.disconnect();
        logger.info("MQTT adapter disconnected");
      }

      // Cerrar base de datos
      if (this.db) {
        await this.db.close();
        logger.info("Database closed");
      }

      logger.info("AgentTCP server stopped");
    } catch (error) {
      logger.error("Error stopping server:", error);
    }
  }

  /**
   * Obtiene estadísticas del servidor
   */
  getStats() {
    const connectionStats = this.connectionManager?.getConnectionStats() || {
      total: 0,
      authenticated: 0,
      unauthenticated: 0,
    };

    return {
      isRunning: this.isRunning,
      connections: connectionStats,
      captureQueue: {
        active: this.captureQueue.size,
        cameras: Array.from(this.captureQueue.keys()),
      },
      mqtt: {
        connected: this.mqttAdapter?.connected || false,
      },
    };
  }

  /**
   * Manejo de señales para cierre graceful
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
