import net from "net";

import { CONFIG } from "../config.js";
import { initDB } from "../db/db.js";
import { initializeModules } from "../modules/index.js";

import { ConnectionManager } from "./connection-manager.js";
import { MessagePipeline } from "./message-pipeline.js";
import { HealthService } from "./health-service.js";

/**
 * TCP Server Core - Responsabilidad: gestionar conexiones TCP.
 * Delega toda la lógica al pipeline de mensajes.
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
    // Inicializar base de datos
    this.db = await initDB();

    // Inicializar sistema de módulos
    await initializeModules();

    // Crear pipeline con dependencias inicializadas
    this.pipeline = new MessagePipeline(this.connectionManager, this.db);

    // Inicializar y comenzar monitoring de salud
    this.healthService = new HealthService(this.connectionManager);
    this.healthService.startMonitoring();

    this.server = net.createServer((socket) => {
      this._handleConnection(socket);
    });

    this.server.listen(CONFIG.PORT, () => {
      console.log(`TCP Server listening on port ${CONFIG.PORT}`);
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
    // Configuración TCP básica
    socket.setNoDelay(true); // Nagle off
    socket.setKeepAlive(true, CONFIG.HEARTBEAT_MS);

    // Delegar manejo de conexión al ConnectionManager
    const connection = this.connectionManager.create(socket);

    // Log nueva conexión
    this.healthService.logConnectionEstablished(connection);

    // Configurar evento de cierre para logging
    socket.on('close', () => {
      this.healthService.logConnectionClosed(connection);
    });

    // Configurar pipeline de procesamiento de mensajes
    this.pipeline.setup(connection);
  }
}
