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
    this.db = await initDB();

    await rehydrateActiveWatches(this.db);

    await initializeModules();

    this.pipeline = new MessagePipeline(this.connectionManager, this.db);
    this.healthService = new HealthService(this.connectionManager);
    this.healthService.startMonitoring();

    this.server = net.createServer((socket) => {
      this._handleConnection(socket);
    });

    this.server.listen(CONFIG.PORT, () => {
      logger.info(`TCP Server listening on port ${CONFIG.PORT}`);
    });

    return this.server;
  }

  async stop() {
    if (this.healthService) {
      this.healthService.stopMonitoring();
    }

    if (this.server) {
      this.server.close();
      this.connectionManager.closeAll();
    }
  }

  _handleConnection(socket) {
    socket.setNoDelay(true);
    socket.setKeepAlive(true, CONFIG.HEARTBEAT_MS);

    const connection = this.connectionManager.create(socket);

    this.healthService.logConnectionEstablished(connection);
    socket.on("close", () => {
      this.healthService.logConnectionClosed(connection);
    });

    this.pipeline.setup(connection);
  }
}
