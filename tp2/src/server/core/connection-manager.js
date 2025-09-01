import crypto from "crypto";
import { setupTransportPipeline, sendMessage } from "../utils/index.js";
import { makeHello } from "../../protocol/index.js";
import { CONFIG } from "../config.js";
import { logger } from "../utils/logger.js";

/**
 * Connection Manager - Gestiona el ciclo de vida de conexiones TCP
 * Responsabilidades:
 * - Crear y destruir conexiones
 * - Gestionar framing/deframing
 * - Mantener registry de conexiones activas
 * - Cleanup automático
 */
export class ConnectionManager {
  constructor() {
    this.connections = new Map();
    this.sessions = new Map();
  }

  create(socket) {
    const connectionId = crypto.randomBytes(8).toString("hex");

    // Setup transport pipeline (framing + JSON parsing + eventos)
    const deframer = setupTransportPipeline(socket, { maxFrameSize: CONFIG.MAX_FRAME });

    const connection = new Connection({
      id: connectionId,
      socket,
      deframer,
      onClose: () => this._cleanup(connectionId),
    });

    this.connections.set(connectionId, connection);

    // Enviar HELLO inicial
    connection.send(
      makeHello({
        maxFrame: CONFIG.MAX_FRAME,
        heartbeat: CONFIG.HEARTBEAT_MS,
      })
    );

    return connection;
  }

  get(connectionId) {
    return this.connections.get(connectionId);
  }

  getBySessionId(sessionId) {
    const session = this.sessions.get(sessionId);
    return session?.connection;
  }

  createSession(connection, sessionData) {
    const sessionId = crypto.randomBytes(8).toString("hex");
    const session = {
      id: sessionId,
      connection,
      ...sessionData,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };

    this.sessions.set(sessionId, session);
    connection.setSession(session);

    return session;
  }

  closeAll() {
    for (const connection of this.connections.values()) {
      connection.close();
    }
  }

  _cleanup(connectionId) {
    const connection = this.connections.get(connectionId);
    if (connection?.session) {
      this.sessions.delete(connection.session.id);
    }
    this.connections.delete(connectionId);
  }
}

/**
 * Connection - Representa una conexión TCP individual
 * Encapsula socket, framing y estado de sesión
 */
class Connection {
  constructor({ id, socket, deframer, onClose }) {
    this.id = id;
    this.socket = socket;
    this.deframer = deframer;
    this.session = null;
    this.onClose = onClose;
    this._setupEventHandlers();
  }

  setSession(session) {
    this.session = session;
  }

  send(message) {
    sendMessage(this.socket, message);
    this._handleBackpressure();
  }

  close(message) {
    if (message) {
      this.send(message);
    }
    this.socket.end();
  }

  _setupEventHandlers() {
    this.socket.on("close", () => {
      this.onClose();
    });

    this.socket.on("error", (err) => {
      logger.error(`Connection ${this.id} error`, { error: err.message });
    });
  }

  _handleBackpressure() {
    if (this.socket.writableNeedDrain) {
      try {
        this.deframer.pause();
      } catch {}

      this.socket.once("drain", () => {
        try {
          this.deframer.resume();
        } catch {}
      });
    }
  }
}
