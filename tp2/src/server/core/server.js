import net from "net";

import { CONFIG } from "../config.js";
import { initDB } from "../db/db.js";
import { initializeModules } from "../business/index.js";
import { logger } from "../utils/logger.js";

import { ConnectionManager } from "./connection-manager.js";
import { MessagePipeline } from "./message-pipeline.js";
import { HealthService } from "./health-service.js";

import { rehydrateActiveWatches } from "../business/services/watchRuntime.js";

/**
 * TCP Server Core
 * Gestiona conexiones TCP y delega procesamiento al pipeline de mensajes
 */
export class TCPServer {
  constructor() {
    this.server = null;
    this.db = null;
    this.connectionManager = new ConnectionManager();
    this.pipeline = null;
    this.healthService = null;
  }

  async start() {
    // Inicializar DB
    this.db = await initDB();

    // Restaurar estado de watches activos
    await rehydrateActiveWatches(this.db);

    // Inicializar módulos de negocio
    await initializeModules(this.db);

    this.pipeline = new MessagePipeline(this.connectionManager, this.db);
    this.healthService = new HealthService(this.connectionManager);
    this.healthService.startMonitoring();

    this.server = net.createServer((socket) => {
      this._handleConnection(socket);
    });

    this.server.on("error", (err) => {
      logger.error("TCP Server error", { err });
    });

    this.server.listen(CONFIG.PORT, () => {
      logger.info(`TCP Server listening on port ${CONFIG.PORT}`);
    });

    return this.server;
  }

  async stop() {
    logger.info("Server shutdown initiated");

    if (this.healthService) {
      this.healthService.stopMonitoring();
    }

    if (this.server) {
      // Enviar SRV_CLOSE a todas las conexiones antes de cerrar
      this.connectionManager.broadcastServerClose({ reason: "shutdown" });

      // Pequeño delay para asegurar que los mensajes SRV_CLOSE se envíen
      // antes de cerrar las conexiones (flush de buffers TCP)
      logger.debug("Waiting for SRV_CLOSE messages to flush...");
      await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms

      this.server.close();
      this.connectionManager.closeAll();
    }

    logger.info("Server shutdown completed");
  }

  _handleConnection(socket) {
    // Capa TCP
    socket.setNoDelay(true); // desactivar Nagle
    socket.setKeepAlive(true, CONFIG.HEARTBEAT_MS);

    // Observabilidad del socket
    socket.on("error", (err) => {
      // Errores del socket
      logger.warn("Socket error", { err });
    });

    // Si el deframer / pipeline de transporte emite `transport-error`,
    // cerramos de inmediato para evitar estados inconsistentes.
    socket.on("transport-error", (err) => {
      logger.warn("Transport error — closing socket defensively", { err });
      // destroy() aborta ambos sentidos y evita que quede zombie
      socket.destroy(err);
    });

    const connection = this.connectionManager.create(socket);

    this.healthService.logConnectionEstablished(connection);
    socket.on("close", () => {
      this.healthService.logConnectionClosed(connection);
    });

    // El pipeline configura framing/deframing, validación y dispatch,
    // además de heartbeats de aplicación, MAX_IN_FLIGHT y deadlines.
    this.pipeline.setup(connection);
  }
}
