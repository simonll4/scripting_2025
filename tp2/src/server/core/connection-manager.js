import crypto from "crypto";
import { setupTransportPipeline, sendMessage } from "../utils/index.js";
import { makeHello } from "../../protocol/index.js";
import { CONFIG } from "../config.js";
import { logger } from "../utils/logger.js";

/**
 * ============================================================================
 * CONNECTION MANAGER
 * ============================================================================
 * Responsabilidades:
 * 1. Crear y gestionar conexiones TCP con identificadores únicos
 * 2. Configurar el pipeline de transporte (framing + parsing)
 * 3. Gestionar sesiones de usuario autenticadas
 * 4. Enviar mensaje HELLO inicial con configuración del servidor
 * 5. Cleanup automático cuando las conexiones se cierran
 */
export class ConnectionManager {
  constructor() {
    this.connections = new Map();
    this.sessions = new Map();
  }

  /**
   * Crea una nueva conexión a partir de un socket TCP
   */
  create(socket) {
    const connectionId = this._generateConnectionId();

    // Configurar pipeline de transporte con framing y parsing automático
    const deframer = setupTransportPipeline(socket, {
      maxFrameSize: CONFIG.MAX_FRAME,
    });

    // Crear wrapper de conexión con cleanup automático
    const connection = new Connection({
      id: connectionId,
      socket,
      deframer,
      onClose: () => this._cleanup(connectionId),
    });

    // Registrar conexión en el mapa
    this.connections.set(connectionId, connection);

    // Enviar mensaje HELLO inicial con configuración del servidor
    connection.send(
      makeHello({
        maxFrame: CONFIG.MAX_FRAME,
        heartbeat: CONFIG.HEARTBEAT_MS,
      })
    );

    logger.debug(`Connection created`, {
      connectionId,
      totalConnections: this.connections.size,
    });

    return connection;
  }

  /**
   * Crea una nueva sesión autenticada y la asocia a una conexión
   */
  createSession(connection, sessionData) {
    const sessionId = this._generateSessionId();

    const session = {
      id: sessionId,
      connection,
      ...sessionData,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };

    // Registrar sesión en ambos mapas para acceso bidireccional
    this.sessions.set(sessionId, session);
    connection.setSession(session);

    return session;
  }

  /**
   * Cierra todas las conexiones activas (para shutdown graceful)
   */
  closeAll(reason = "Server shutdown") {
    logger.info(`Closing all connections`, {
      count: this.connections.size,
      reason,
    });

    for (const connection of this.connections.values()) {
      connection.close();
    }
  }

  // ====================================
  // PRIVATE METHODS
  // ====================================

  /**
   * Genera un ID único para una nueva conexión
   */
  _generateConnectionId() {
    return crypto.randomBytes(8).toString("hex");
  }

  /**
   * Genera un ID único para una nueva sesión
   */
  _generateSessionId() {
    return crypto.randomBytes(8).toString("hex");
  }

  /**
   * Limpia una conexión y su sesión asociada cuando se cierra
   */
  _cleanup(connectionId) {
    const connection = this.connections.get(connectionId);

    if (connection?.session) {
      logger.debug(`Cleaning up session`, {
        sessionId: connection.session.id,
        connectionId,
      });
      this.sessions.delete(connection.session.id);
    }

    this.connections.delete(connectionId);

    logger.debug(`Connection cleaned up`, {
      connectionId,
      remainingConnections: this.connections.size,
    });
  }
}

/**
 * ============================================================================
 * CONNECTION CLASS
 * ============================================================================
 * Representa una conexión TCP individual con funcionalidades de:
 * - Envío de mensajes con backpressure handling
 * - Gestión de sesión de usuario
 * - Manejo de eventos del socket
 * - Cleanup automático de recursos
 */
class Connection {
  constructor({ id, socket, deframer, onClose }) {
    this.id = id;
    this.socket = socket;
    this.deframer = deframer;
    this.session = null;
    this.onClose = onClose;
    this.isConnected = true;

    this._setupEventHandlers();
  }

  /**
   * Asocia una sesión autenticada a esta conexión
   */
  setSession(session) {
    this.session = session;
  }

  /**
   * Envía un mensaje al cliente con manejo de backpressure
   */
  send(message) {
    if (!this.isConnected) {
      logger.warn(`Attempted to send message to closed connection`, {
        connectionId: this.id,
      });
      return;
    }

    try {
      sendMessage(this.socket, message);
      this._handleBackpressure();
    } catch (error) {
      logger.error(`Failed to send message`, {
        connectionId: this.id,
        error: error.message,
      });
    }
  }

  /**
   * Cierra la conexión opcionalmente enviando un mensaje final
   */
  close(finalMessage) {
    if (!this.isConnected) return;

    if (finalMessage) {
      this.send(finalMessage);
    }

    this.isConnected = false;
    this.socket.end();

    logger.debug(`Connection closed`, {
      connectionId: this.id,
      hadSession: !!this.session,
    });
  }

  // ====================================
  // PRIVATE METHODS
  // ====================================

  /**
   * Configura los event handlers del socket TCP
   */
  _setupEventHandlers() {
    // Cleanup cuando se cierra la conexión
    this.socket.on("close", () => {
      this.isConnected = false;
      this.onClose();
    });

    // Log de errores de socket
    this.socket.on("error", (err) => {
      logger.error(`Socket error on connection ${this.id}`, {
        connectionId: this.id,
        error: err.message,
        code: err.code,
      });
      this.isConnected = false;
    });
  }

  /**
   * Maneja backpressure
   */
  _handleBackpressure() {
    if (!this.socket.writableNeedDrain) return;

    try {
      this.deframer.pause();
    } catch (error) {
      // El deframer podría ya estar pausado o cerrado
    }

    // Reanudar cuando el socket pueda drenar nuevamente
    this.socket.once("drain", () => {
      try {
        this.deframer.resume();
      } catch (error) {
        // El deframer podría estar cerrado
      }
    });
  }
}
