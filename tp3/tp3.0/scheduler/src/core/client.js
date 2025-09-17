/**
 * ============================================================================
 * SCHEDULER CLIENT
 * ============================================================================
 */

import net from "net";
import crypto from "crypto";
import {
  makeRequest,
  makeHello,
  PROTOCOL,
  sendMessage,
  setupTransportPipeline,
} from "../../../protocol/index.js";
import { createLogger } from "../../../utils/logger.js";

const logger = createLogger("SCHEDULER-CLIENT");

/**
 * Cliente TCP optimizado para scheduler
 */
export class SchedulerClient {
  constructor(config) {
    this.config = config;
    this.socket = null;
    this.authenticated = false;
    this.pendingRequests = new Map();
    this.isConnecting = false;
    this.retryCount = 0;

    // Stats simplificadas
    this.stats = {
      connected: false,
      totalRequests: 0,
      successful: 0,
      failed: 0,
      reconnections: 0,
    };
  }

  /**
   * Conecta al servidor AgentTCP
   */
  async connect() {
    if (this.isConnecting || (this.socket && !this.socket.destroyed)) {
      return;
    }

    this.isConnecting = true;

    try {
      logger.info(
        `Connecting to AgentTCP at ${this.config.AGENT_HOST}:${this.config.AGENT_PORT}`
      );

      await this.connectSocket();
      await this.authenticate();

      this.retryCount = 0;
      this.isConnecting = false;
      this.stats.connected = true;

      logger.info("Connected and authenticated successfully");
    } catch (error) {
      this.isConnecting = false;
      this.cleanup();

      logger.error("Connection failed:", error.message);
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Conecta el socket TCP
   */
  async connectSocket() {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();

      const timeout = setTimeout(() => {
        this.socket.destroy();
        reject(new Error("Connection timeout"));
      }, 10000);

      this.socket.connect(
        this.config.AGENT_PORT,
        this.config.AGENT_HOST,
        () => {
          clearTimeout(timeout);
          logger.debug("TCP connection established");
          this.setupEventHandlers();
          resolve();
        }
      );

      this.socket.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Configura eventos del socket
   */
  setupEventHandlers() {
    // Setup proper protocol transport pipeline
    setupTransportPipeline(this.socket);

    this.socket.on("message", (message) => {
      this.handleMessage(message);
    });

    this.socket.on("transport-error", (error) => {
      logger.error("Transport error:", error.message);
      this.disconnect();
    });

    this.socket.on("close", () => {
      logger.warn("Connection closed");
      this.stats.connected = false;
      this.authenticated = false;
      this.rejectAllPending("Connection closed");

      // Auto-reconectar
      if (this.retryCount < 3) {
        setTimeout(() => this.reconnect(), 5000);
      }
    });

    this.socket.on("error", (error) => {
      logger.error("Socket error:", error.message);
      this.stats.connected = false;
      this.authenticated = false;
      this.rejectAllPending(`Socket error: ${error.message}`);
    });
  }

  /**
   * Maneja mensajes recibidos del servidor
   */
  handleMessage(message) {
    logger.debug("Received message:", JSON.stringify(message));

    // Handle HELLO messages
    if (message.t === "hello") {
      logger.debug("Received HELLO from server");
      return;
    }

    // Handle responses and errors
    if (message.t === "res" || message.t === "err") {
      const pendingRequest = this.pendingRequests.get(message.id);
      if (pendingRequest) {
        clearTimeout(pendingRequest.timeout);
        this.pendingRequests.delete(message.id);

        if (message.t === "res") {
          this.stats.successful++;
          pendingRequest.resolve({ success: true, ...message });
        } else {
          this.stats.failed++;
          pendingRequest.reject(new Error(message.msg || "Request failed"));
        }
      } else {
        logger.warn(`Received response for unknown request ID: ${message.id}`);
      }
    }
  }

  /**
   * Autentica con el servidor
   */
  async authenticate() {
    logger.debug(
      `Starting authentication with token: ${this.config.TOKEN?.substring(
        0,
        8
      )}...`
    );

    const authRequest = makeRequest(
      crypto.randomUUID(),
      PROTOCOL.COMMANDS.AUTH,
      { token: this.config.TOKEN }
    );

    logger.debug(`Sending auth request: ${JSON.stringify(authRequest)}`);
    const response = await this.sendRequest(authRequest);

    if (!response.success) {
      throw new Error(`Authentication failed: ${response.errorMessage}`);
    }

    this.authenticated = true;
    logger.debug("Authentication successful");
  }

  /**
   * Envía request y espera respuesta
   */
  async sendRequest(request) {
    if (!this.socket || this.socket.destroyed) {
      throw new Error("Not connected");
    }

    this.stats.totalRequests++;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`Request timeout for ${request.id}`));
      }, 10000); // Reducido a 10s para auth

      this.pendingRequests.set(request.id, {
        resolve,
        reject,
        timeout,
        startTime: Date.now(),
      });

      try {
        sendMessage(this.socket, request);
        logger.debug(`Sent request: ${request.act} with ID: ${request.id}`);
      } catch (error) {
        this.pendingRequests.delete(request.id);
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Solicita captura de snapshot
   */
  async requestSnapshot(options = {}) {
    if (!this.authenticated) {
      await this.connect();
    }

    const snapshotRequest = makeRequest(
      crypto.randomUUID(),
      PROTOCOL.COMMANDS.SNAPSHOT,
      {
        cameraId: options.cameraId || this.config.DEFAULT_CAMERA,
        width: options.width || this.config.WIDTH,
        height: options.height || this.config.HEIGHT,
        quality: options.quality || this.config.QUALITY,
        qualityPreset: options.qualityPreset || this.config.QUALITY_PRESET,
        topic: options.topic || this.config.DEFAULT_TOPIC,
      }
    );

    return this.sendRequest(snapshotRequest);
  }

  /**
   * Reconecta al servidor
   */
  async reconnect() {
    this.retryCount++;
    this.stats.reconnections++;

    try {
      await this.connect();
      logger.info("Reconnection successful");
    } catch (error) {
      logger.error(
        `Reconnection failed (attempt ${this.retryCount}):`,
        error.message
      );
    }
  }

  /**
   * Rechaza todos los requests pendientes
   */
  rejectAllPending(reason) {
    for (const [id, pendingRequest] of this.pendingRequests) {
      clearTimeout(pendingRequest.timeout);
      pendingRequest.reject(new Error(reason));
    }
    this.pendingRequests.clear();
  }

  /**
   * Limpia recursos
   */
  cleanup() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.authenticated = false;
    this.stats.connected = false;
    this.rejectAllPending("Client disconnected");
  }

  /**
   * Desconecta del servidor
   */
  async disconnect() {
    this.cleanup();
    logger.info("Disconnected from AgentTCP");
  }

  /**
   * Obtiene estadísticas de conexión
   */
  getConnectionStats() {
    return {
      connected: this.stats.connected,
      authenticated: this.authenticated,
      pendingRequests: this.pendingRequests.size,
      retryCount: this.retryCount,
      totalRequests: this.stats.totalRequests,
      successful: this.stats.successful,
      failed: this.stats.failed,
      reconnections: this.stats.reconnections,
    };
  }
}
