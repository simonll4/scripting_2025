import { createSocket } from "./socket.js";
import { PROTOCOL, makeRequest, sendMessage } from "../../protocol/index.js";
import { logger } from "../utils/logger.js";

/**
 * Cliente TCP para comunicación con el servidor.
 */
export class Client {
  constructor(cfg) {
    this.cfg = cfg;
    this.socket = null;
    this.reconfigureTransport = null;

    // Estado de la conexión
    this.state = {
      connected: false,
      authenticated: false,
      sessionId: null,
    };

    // Manejo de requests pendientes
    this.ids = 1;
    this.pending = new Map(); // id -> { action, timer }

    // Callbacks públicos (configurables desde afuera)
    this.onAuthenticated = null;
    this.onResponse = null;
    this.onError = null;
    this.onDisconnected = null;
  }

  // ============================================================================
  // API PÚBLICA
  // ============================================================================

  connect() {
    const { host, port, keepAliveMs } = this.cfg;

    // Crear socket y configurar transporte
    const { socket, reconfigureTransport } = createSocket({
      host,
      port,
      keepAliveMs,
    });

    this.socket = socket;
    this.reconfigureTransport = reconfigureTransport;

    this._setupSocketEvents();

    logger.info(`Conectando a ${host}:${port}...`);
  }

  disconnect() {
    this._cleanup();

    try {
      this.socket?.end();
    } catch (error) {
      // Ignorar errores al cerrar
    }
  }

  send(action, data = null) {
    // Validaciones de estado
    if (!this.state.connected) {
      logger.error("No conectado");
      return null;
    }

    if (!this.state.authenticated && action !== PROTOCOL.CORE_ACTS.AUTH) {
      logger.error("Debe autenticarse antes de enviar comandos");
      return null;
    }

    // Crear request
    const id = `c${this.ids++}`;
    const request = makeRequest(id, action, data);

    try {
      // Configurar timeout para el request
      this._setupRequestTimeout(id, action);

      // Enviar mensaje
      sendMessage(this.socket, request);

      return id;
    } catch (error) {
      this.pending.delete(id);
      logger.error("Error enviando mensaje", {
        action,
        error: error.message,
      });
      return null;
    }
  }

  // ============================================================================
  // CONFIGURACIÓN INTERNA
  // ============================================================================

  _setupSocketEvents() {
    const { socket } = this;

    // Evento de conexión exitosa
    socket.once("connect", () => {
      this.state.connected = true;
      logger.info(
        `Conectado a ${this.cfg.host}:${this.cfg.port}. Esperando HELLO...`
      );
    });

    // Evento de cierre de conexión
    socket.on("close", () => {
      this._handleDisconnection();
    });

    // Mensajes del protocolo (JSON parseado automáticamente)
    socket.on("message", (message) => {
      this._handleMessage(message);
    });

    // Errores de transporte
    socket.on("transport-error", (error) => {
      logger.error("Error de transporte", { error: error.message });
    });

    // Errores generales del socket
    socket.on("error", (error) => {
      logger.error("Error de socket", {
        code: error.code,
        message: error.message,
      });
    });
  }

  _setupRequestTimeout(id, action) {
    const timer = setTimeout(() => {
      this.pending.delete(id);
      logger.error(`Timeout esperando respuesta`, {
        requestId: id,
        action,
        timeout: this.cfg.requestTimeoutMs,
      });
    }, this.cfg.requestTimeoutMs);

    this.pending.set(id, { action, timer });
  }

  // ============================================================================
  // MANEJO DE MENSAJES
  // ============================================================================

  _handleMessage(msg) {
    // Validar versión del protocolo
    if (msg.v && msg.v !== PROTOCOL.VERSION) {
      logger.error(`Versión de protocolo no soportada: ${msg.v}`);
      return;
    }

    // Limpiar timeout si es respuesta a un request pendiente
    this._clearPendingRequest(msg.id);

    // Procesar según tipo de mensaje
    switch (msg.t) {
      case PROTOCOL.TYPES.HELLO:
        this._handleHello(msg);
        break;
      case PROTOCOL.TYPES.RES:
        this._handleResponse(msg);
        break;
      case PROTOCOL.TYPES.ERR:
        this._handleError(msg);
        break;
      default:
        logger.error(`Tipo de mensaje desconocido: ${msg.t}`);
    }
  }

  _handleHello(msg) {
    const { heartbeat, maxFrame } = msg?.data || {};

    // Configurar heartbeat si el servidor lo especifica
    if (typeof heartbeat === "number" && heartbeat > 0) {
      this.socket.setKeepAlive(true, heartbeat);
      logger.info(`Heartbeat configurado: ${heartbeat}ms`);
    }

    // Reconfigurar maxFrame si es diferente al default
    if (typeof maxFrame === "number" && maxFrame > 0) {
      this.reconfigureTransport(maxFrame);
    }

    // Iniciar autenticación automáticamente
    logger.info("HELLO recibido. Iniciando autenticación...");
    this.send(PROTOCOL.CORE_ACTS.AUTH, { token: this.cfg.token });
  }

  _handleResponse(msg) {
    // Respuesta de autenticación
    if (msg.act === PROTOCOL.CORE_ACTS.AUTH) {
      this._handleAuthResponse(msg);
      return;
    }

    // Respuesta genérica de comando
    this.onResponse?.(msg);
  }

  _handleAuthResponse(msg) {
    const sessionId = msg?.data?.sessionId;

    if (!sessionId) {
      logger.error("Autenticación fallida: respuesta inválida");
      this.disconnect();
      return;
    }

    // Actualizar estado
    this.state.authenticated = true;
    this.state.sessionId = sessionId;

    logger.ok(`Autenticado exitosamente. Session ID: ${sessionId}`);
    this.onAuthenticated?.(sessionId);
  }

  _handleError(msg) {
    const { code, msg: message, act } = msg;

    logger.error(`Error del servidor`, {
      action: act || "unknown",
      code,
      message,
      details: msg.details,
    });

    // Errores críticos de autenticación -> desconectar
    if (this._isCriticalAuthError(code)) {
      logger.error("Error crítico de autenticación. Desconectando...");
      this.disconnect();
    } else {
      this.onError?.(msg);
    }
  }

  // ============================================================================
  // UTILIDADES INTERNAS
  // ============================================================================

  _clearPendingRequest(messageId) {
    if (messageId && this.pending.has(messageId)) {
      const { timer } = this.pending.get(messageId);
      clearTimeout(timer);
      this.pending.delete(messageId);
    }
  }

  _isCriticalAuthError(code) {
    return [
      PROTOCOL.ERROR_CODES.UNAUTHORIZED,
      PROTOCOL.ERROR_CODES.INVALID_TOKEN,
      PROTOCOL.ERROR_CODES.TOKEN_EXPIRED,
    ].includes(code);
  }

  _handleDisconnection() {
    this.state.connected = false;
    this.state.authenticated = false;
    this.state.sessionId = null;

    this._cleanup();

    logger.info("Conexión cerrada");
    this.onDisconnected?.();
  }

  _cleanup() {
    // Limpiar todos los timers pendientes
    this.pending.forEach(({ timer }) => clearTimeout(timer));
    this.pending.clear();
  }
}
