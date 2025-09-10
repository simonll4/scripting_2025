/**
 * ============================================================================
 * CONNECTION MANAGER - Camera System TP3.0
 * ============================================================================
 * Gestión de conexiones TCP, estado y ciclo de vida
 */

import crypto from "crypto";
import { createLogger } from "../../shared/utils/logger.js";
import { 
  MessageDeframer, 
  setupTransportPipeline, 
  writeFrame, 
  makeHello 
} from "../../protocol/index.js";

const logger = createLogger("CONNECTION-MANAGER");

/**
 * Gestor de conexiones
 */
export class ConnectionManager {
  constructor(config) {
    this.config = config;
    this.connections = new Set();
    this.connectionTimeouts = new Map();
  }

  /**
   * Maneja una nueva conexión
   */
  handleConnection(socket, messagePipeline) {
    const connId = crypto.randomUUID();
    const connState = {
      id: connId,
      socket,
      authenticated: false,
      tokenId: null,
      session: null,
      createdAt: Date.now(),
    };

    logger.info(`New connection: ${connId} from ${socket.remoteAddress}`);
    this.connections.add(connState);

    // Configurar timeouts
    socket.setTimeout(30000); // 30s timeout
    
    // Configurar pipeline de transporte
    setupTransportPipeline(socket, {
      maxFrameSize: this.config.MAX_FRAME_BYTES,
    });

    // Manejar mensajes decodificados
    socket.on("message", (message) => {
      messagePipeline.handleMessage(connState, message);
    });

    // Manejar errores de transporte
    socket.on("transport-error", (error) => {
      logger.error(`Transport error on ${connId}:`, error.message);
      this.closeConnection(connState);
    });

    // Manejar cierre de conexión
    socket.on("close", () => {
      logger.info(`Connection closed: ${connId}`);
      this.connections.delete(connState);
      this.connectionTimeouts.delete(connId);
    });

    socket.on("error", (error) => {
      logger.error(`Socket error on ${connId}:`, error.message);
      this.closeConnection(connState);
    });

    socket.on("timeout", () => {
      logger.warn(`Socket timeout on ${connId}`);
      this.closeConnection(connState);
    });

    // Enviar HELLO automáticamente
    this.sendHello(connState);

    return connState;
  }

  /**
   * Envía mensaje HELLO inicial
   */
  sendHello(connState) {
    const hello = makeHello({
      maxFrame: this.config.MAX_FRAME_BYTES,
      maxPayload: this.config.MAX_PAYLOAD_BYTES || 1_048_576,
      serverVersion: 1, // PROTOCOL.VERSION
    });

    if (writeFrame(connState.socket, hello)) {
      logger.debug(`HELLO sent to ${connState.id}`);
    } else {
      logger.error(`Failed to send HELLO to ${connState.id}`);
      this.closeConnection(connState);
    }
  }

  /**
   * Cierra una conexión
   */
  closeConnection(connState) {
    try {
      if (!connState.socket.destroyed) {
        connState.socket.destroy();
      }
    } catch (error) {
      // Ignorar errores al cerrar
    }

    this.connections.delete(connState);
    this.connectionTimeouts.delete(connState.id);
  }

  /**
   * Cierra todas las conexiones
   */
  closeAllConnections() {
    for (const connState of this.connections) {
      this.closeConnection(connState);
    }
  }

  /**
   * Obtiene estadísticas de conexiones
   */
  getConnectionStats() {
    const total = this.connections.size;
    const authenticated = Array.from(this.connections)
      .filter(conn => conn.authenticated).length;

    return {
      total,
      authenticated,
      unauthenticated: total - authenticated,
    };
  }
}
