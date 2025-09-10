/**
 * ============================================================================
 * SCHEDULER CLIENT - Camera System TP3.0
 * ============================================================================
 * Cliente TCP refactorizado con correlación estricta por ID y configuración dinámica
 */

import net from "net";
import crypto from "crypto";
import {
  PROTOCOL,
  MessageDeframer,
  setupTransportPipeline,
  sendMessage,
  makeRequest,
  isValidResponse,
  isValidHello,
} from "../../protocol/index.js";
import { createLogger } from "../../shared/utils/logger.js";

const logger = createLogger("SCHEDULER-CLIENT");

/**
 * Cliente TCP para comunicación con AgentTCP
 */
export class SchedulerClient {
  constructor(config) {
    this.config = config;
    this.connection = null;
    this.authenticated = false;
    this.serverLimits = null;
    this.pendingRequests = new Map(); // Correlación por ID
    this.isConnecting = false;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.baseRetryDelay = 1000; // 1 segundo base
  }

  /**
   * Conecta al servidor AgentTCP
   */
  async connect() {
    if (this.isConnecting || (this.connection && !this.connection.destroyed)) {
      return this.connection;
    }

    this.isConnecting = true;

    try {
      logger.info(`Connecting to AgentTCP at ${this.config.AGENT_HOST}:${this.config.AGENT_PORT}`);

      const socket = await this.createConnection();
      
      // Configurar pipeline de transporte
      setupTransportPipeline(socket);

      // Manejar mensajes
      socket.on("message", (message) => {
        this.handleMessage(message);
      });

      // Manejar errores y desconexiones
      this.setupConnectionEvents(socket);

      this.connection = socket;

      // Esperar y procesar HELLO del servidor
      await this.waitForHello();

      // Autenticarse
      await this.authenticate();

      this.authenticated = true;
      this.retryCount = 0; // Reset retry counter on successful connection
      
      logger.info("Successfully connected and authenticated with AgentTCP");
      
      return this.connection;

    } catch (error) {
      this.isConnecting = false;
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Crea la conexión TCP
   */
  async createConnection() {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      
      const timeout = setTimeout(() => {
        socket.destroy();
        reject(new Error("Connection timeout"));
      }, PROTOCOL.LIMITS.CONNECT_TIMEOUT_MS);

      socket.connect(this.config.AGENT_PORT, this.config.AGENT_HOST, () => {
        clearTimeout(timeout);
        logger.debug("TCP connection established");
        resolve(socket);
      });

      socket.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Configura eventos de la conexión
   */
  setupConnectionEvents(socket) {
    socket.on("close", () => {
      logger.warn("Connection closed");
      this.connection = null;
      this.authenticated = false;
      this.rejectAllPending("Connection closed");
      
      // Auto-reconectar después de un delay
      if (this.retryCount < this.maxRetries) {
        const delay = this.calculateRetryDelay();
        logger.info(`Reconnecting in ${delay}ms (attempt ${this.retryCount + 1}/${this.maxRetries})`);
        setTimeout(() => this.reconnect(), delay);
      } else {
        logger.error("Max reconnection attempts reached");
      }
    });

    socket.on("error", (error) => {
      logger.error("Connection error:", error.message);
      this.connection = null;
      this.authenticated = false;
      this.rejectAllPending(`Connection error: ${error.message}`);
    });

    socket.on("transport-error", (error) => {
      logger.error("Transport error:", error.message);
      socket.destroy();
    });
  }

  /**
   * Espera el mensaje HELLO del servidor
   */
  async waitForHello() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("HELLO timeout"));
      }, 10000);

      const handleHello = (message) => {
        if (isValidHello(message)) {
          clearTimeout(timeout);
          
          // Configurar límites dinámicamente basados en HELLO
          this.serverLimits = {
            maxFrame: message.data.maxFrame,
            maxPayload: message.data.maxPayload,
            serverVersion: message.data.serverVersion,
          };

          logger.info("Received HELLO from server:", this.serverLimits);
          
          // Reconfigurar deframer con el nuevo límite si es necesario
          if (this.connection._deframer && this.serverLimits.maxFrame !== PROTOCOL.LIMITS.MAX_FRAME) {
            logger.debug(`Updating maxFrame from ${PROTOCOL.LIMITS.MAX_FRAME} to ${this.serverLimits.maxFrame}`);
            this.connection._deframer.maxFrameSize = this.serverLimits.maxFrame;
          }

          resolve();
        }
      };

      // Escuchar el primer mensaje que debe ser HELLO
      const originalHandler = this.handleMessage.bind(this);
      this.handleMessage = (message) => {
        handleHello(message);
        // Restaurar handler original después de HELLO
        this.handleMessage = originalHandler;
      };
    });
  }

  /**
   * Autentica con el servidor
   */
  async authenticate() {
    const authRequest = makeRequest(
      crypto.randomUUID(),
      PROTOCOL.COMMANDS.AUTH,
      { token: this.config.TOKEN }
    );

    const response = await this.sendRequestAndWaitResponse(authRequest);

    if (!response.ok) {
      throw new Error(`Authentication failed: ${response.msg || response.code}`);
    }

    logger.info("Authentication successful:", {
      tokenId: response.data?.tokenId,
      scopes: response.data?.scopes,
    });
  }

  /**
   * Maneja mensajes recibidos del servidor
   */
  handleMessage(message) {
    logger.debug("Received message:", { type: message.t, action: message.act, id: message.id });

    // Solo procesar respuestas
    if (!isValidResponse(message)) {
      logger.debug("Ignoring non-response message");
      return;
    }

    // Buscar request pendiente por ID
    const pendingRequest = this.pendingRequests.get(message.id);
    if (!pendingRequest) {
      logger.warn(`Received response for unknown request ID: ${message.id}`);
      return;
    }

    // Remover de pendientes
    this.pendingRequests.delete(message.id);
    clearTimeout(pendingRequest.timeout);

    // Resolver o rechazar
    if (message.ok) {
      pendingRequest.resolve(message);
    } else {
      const error = new Error(message.msg || message.code);
      error.code = message.code;
      error.details = message.details;
      pendingRequest.reject(error);
    }
  }

  /**
   * Envía request y espera respuesta con correlación por ID
   */
  async sendRequestAndWaitResponse(request) {
    if (!this.connection || this.connection.destroyed) {
      throw new Error("Not connected");
    }

    return new Promise((resolve, reject) => {
      // Configurar timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`Request timeout for ${request.id}`));
      }, PROTOCOL.LIMITS.REQUEST_TIMEOUT_MS);

      // Registrar request pendiente
      this.pendingRequests.set(request.id, {
        resolve,
        reject,
        timeout,
        request,
        startTime: Date.now(),
      });

      // Enviar request
      try {
        sendMessage(this.connection, request);
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
        width: options.width || 1280,
        height: options.height || 720,
        quality: options.quality || 80,
        topic: options.topic || this.config.DEFAULT_TOPIC,
      }
    );

    return this.sendRequestAndWaitResponse(snapshotRequest);
  }

  /**
   * Reconecta con backoff exponencial
   */
  async reconnect() {
    this.retryCount++;
    try {
      await this.connect();
      logger.info("Reconnection successful");
    } catch (error) {
      logger.error(`Reconnection failed (attempt ${this.retryCount}):`, error.message);
    }
  }

  /**
   * Calcula el delay para reintentos con backoff exponencial
   */
  calculateRetryDelay() {
    return Math.min(this.baseRetryDelay * Math.pow(2, this.retryCount), 30000); // Max 30s
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
   * Desconecta del servidor
   */
  async disconnect() {
    if (this.connection && !this.connection.destroyed) {
      this.rejectAllPending("Disconnecting");
      this.connection.destroy();
      this.connection = null;
    }
    this.authenticated = false;
    this.retryCount = 0;
  }

  /**
   * Obtiene estadísticas de conexión
   */
  getConnectionStats() {
    return {
      connected: this.connection && !this.connection.destroyed,
      authenticated: this.authenticated,
      pendingRequests: this.pendingRequests.size,
      retryCount: this.retryCount,
      serverLimits: this.serverLimits,
    };
  }
}
