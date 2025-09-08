import { createSocket } from "./socket.js";
import {
  PROTOCOL,
  makeRequest,
  makePong,
  sendMessage,
} from "../../protocol/index.js";
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

    // Manejo de requests pendientes y control de flujo
    this.ids = 1;
    this.pending = new Map(); // id -> { action, timer }
    this.queue = []; // [{ action, data, resolve, reject }]
    this.inFlight = 0;
    this.maxInFlight = PROTOCOL.LIMITS.MAX_IN_FLIGHT;

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
    const { host, port, keepAliveMs, connectTimeoutMs } = this.cfg;

    // Crear socket y configurar transporte
    const { socket, reconfigureTransport } = createSocket({
      host,
      port,
      keepAliveMs,
      connectTimeoutMs,
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

  /**
   * Encola (si es necesario) y envía un request respetando MAX_IN_FLIGHT.
   * Devuelve el id del request (o null si no se pudo encolar).
   */
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

    const id = `c${this.ids++}`;
    const item = { id, action, data };

    // Si hay capacidad, se envía de inmediato; si no, a la cola FIFO
    if (this.inFlight < this.maxInFlight) {
      this._dispatch(item);
    } else {
      this.queue.push(item);
      logger.debug?.(
        `Encolado ${id}; inFlight=${this.inFlight}/${this.maxInFlight}`
      );
    }

    return id;
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
      // Ante error de transporte, el socket se destruye desde el transport layer
      // Aquí sólo dejamos trazabilidad adicional si hiciera falta.
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
      // Timeout por request: liberamos slot y avisamos
      this._onReplySettled(id);
      const errMsg = `Timeout esperando respuesta`;
      logger.error(errMsg, {
        requestId: id,
        action,
        timeout: this.cfg.requestTimeoutMs,
      });
      // Callback de error de capa aplicación
      this.onError?.({
        v: PROTOCOL.VERSION,
        t: PROTOCOL.TYPES.ERR,
        id,
        act: action,
        ok: false,
        code: PROTOCOL.ERROR_CODES.CONNECTION,
        msg: errMsg,
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

    // PING/PONG del servidor
    if (msg.t === PROTOCOL.TYPES.PING) {
      sendMessage(this.socket, makePong());
      return;
    }
    if (msg.t === PROTOCOL.TYPES.PONG) {
      // noop: sólo confirmación de latido
      return;
    }

    // Limpiar timeout si es respuesta a un request pendiente
    if (msg.id) this._onReplySettled(msg.id);

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
      case PROTOCOL.TYPES.SRV_CLOSE:
        // cierre controlado desde el servidor
        logger.warn(
          `Servidor cerró la conexión: ${msg?.data?.reason || "sin razón"}`
        );
        this.disconnect();
        break;
      default:
        logger.error(`Tipo de mensaje desconocido: ${msg.t}`);
    }
  }

  _handleHello(msg) {
    const { maxFrame, maxInFlight, heartbeatMs } = msg?.data || {};

    // Configurar heartbeat TCP si el servidor lo especifica
    if (typeof heartbeatMs === "number" && heartbeatMs > 0) {
      this.socket.setKeepAlive(true, heartbeatMs);
      logger.info(`Heartbeat TCP configurado: ${heartbeatMs}ms`);
    }

    // Reconfigurar maxFrame si es diferente al default
    if (typeof maxFrame === "number" && maxFrame > 0) {
      this.reconfigureTransport(maxFrame);
    }

    // Actualizar maxInFlight si el servidor lo informa
    if (typeof maxInFlight === "number" && maxInFlight > 0) {
      this.maxInFlight = maxInFlight;
      logger.info(`MAX_IN_FLIGHT (server hint): ${this.maxInFlight}`);
    }

    // (Opcional) podrías usar heartbeatMs para timers propios si quisieras.

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

    // Intentar despachar más pendientes si hay slots libres
    this._flushQueue();
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

    logger.ok?.(`Autenticado exitosamente. Session ID: ${sessionId}`);
    this.onAuthenticated?.(sessionId);

    // Tras autenticación, intentar enviar lo que haya quedado en cola
    this._flushQueue();
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
    if (act === PROTOCOL.CORE_ACTS.AUTH && this._isCriticalAuthError(code)) {
      logger.error("Error crítico de autenticación. Desconectando...");
      this.disconnect();
      return;
    }

    // Propaga al callback de app
    this.onError?.(msg);

    // Intentar despachar más pendientes si hay slots libres
    this._flushQueue();
  }

  // ============================================================================
  // UTILIDADES INTERNAS
  // ============================================================================

  _dispatch({ id, action, data }) {
    try {
      const request = makeRequest(id, action, data);
      this._setupRequestTimeout(id, action);
      sendMessage(this.socket, request);
      this.inFlight += 1;
      logger.debug?.(
        `Enviado ${id}; inFlight=${this.inFlight}/${this.maxInFlight}`
      );
    } catch (error) {
      // En caso de error al enviar, liberamos cualquier timer residual
      this._onReplySettled(id);
      logger.error("Error enviando mensaje", { action, error: error.message });
    }
  }

  _flushQueue() {
    while (this.queue.length > 0 && this.inFlight < this.maxInFlight) {
      const item = this.queue.shift();
      this._dispatch(item);
    }
  }

  _onReplySettled(messageId) {
    // limpia timeout + libera slot + avanza la cola
    if (messageId && this.pending.has(messageId)) {
      const { timer } = this.pending.get(messageId);
      clearTimeout(timer);
      this.pending.delete(messageId);
      this.inFlight = Math.max(0, this.inFlight - 1);
      this._flushQueue();
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
    this.queue = [];
    this.inFlight = 0;
  }
}

