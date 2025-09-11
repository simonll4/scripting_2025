/**
 * ============================================================================
 * MESSAGE PIPELINE - Camera System TP3.0
 * ============================================================================
 * Pipeline de procesamiento de mensajes y enrutamiento de comandos
 */

import { createLogger } from "../../utils/logger.js";
import { 
  PROTOCOL, 
  makeResponse, 
  makeError, 
  isValidRequest,
  writeFrame 
} from "../../protocol/index.js";
import { validateToken } from "../security/token-service.js";
import { getCommandHandler, isValidCommand } from "../business/index.js";

const logger = createLogger("MESSAGE-PIPELINE");

/**
 * Pipeline de procesamiento de mensajes
 */
export class MessagePipeline {
  constructor({ db, mqttAdapter, captureQueue, config }) {
    this.db = db;
    this.mqttAdapter = mqttAdapter;
    this.captureQueue = captureQueue;
    this.config = config;
  }

  /**
   * Maneja un mensaje decodificado
   */
  async handleMessage(connState, message) {
    const startTime = Date.now();

    try {
      // Validar estructura básica del mensaje
      if (!isValidRequest(message)) {
        logger.warn(`Invalid request from ${connState.id}:`, message);
        return;
      }

      const { id, act: action, data } = message;
      logger.debug(`Processing ${action} from ${connState.id}`);

      let response;

      // Manejar comandos especiales que no requieren autenticación
      if (action === PROTOCOL.COMMANDS.AUTH) {
        response = await this.handleAuthCommand(connState, data, { startTime, requestId: id });
      } else if (action === PROTOCOL.COMMANDS.HELLO) {
        response = await this.handleHelloCommand(connState, data, { startTime, requestId: id });
      } else {
        // Comandos que requieren procesamiento de negocio
        response = await this.handleBusinessCommand(connState, action, data, { startTime, requestId: id });
      }

      // Enviar respuesta
      if (response && !writeFrame(connState.socket, response)) {
        logger.warn(`Failed to send response to ${connState.id}`);
      }

    } catch (error) {
      logger.error(`Message handling error from ${connState.id}:`, error);
      
      // Enviar error genérico si es posible
      const errorResponse = makeError(
        message?.id || "unknown",
        message?.act || "unknown",
        PROTOCOL.ERROR_CODES.INTERNAL_ERROR,
        "Internal server error",
        { startedAt: startTime }
      );

      writeFrame(connState.socket, errorResponse);
    }
  }

  /**
   * Maneja comando HELLO
   */
  async handleHelloCommand(connState, data, { startTime, requestId }) {
    return makeResponse(
      requestId || data?.id || "hello", 
      PROTOCOL.COMMANDS.HELLO, 
      { ack: true },
      startTime
    );
  }

  /**
   * Maneja comando AUTH
   */
  async handleAuthCommand(connState, data, { startTime, requestId }) {
    const finalRequestId = requestId || data?.id || "auth";

    logger.debug("AUTH command received from", connState.id);
    
    if (!data?.token) {
      return makeError(
        finalRequestId,
        PROTOCOL.COMMANDS.AUTH,
        PROTOCOL.ERROR_CODES.BAD_REQUEST,
        "Token required",
        { startedAt: startTime }
      );
    }

    try {
      // Validar token
      const result = await validateToken(this.db, data.token);
      
      if (!result.valid) {
        const errorCode = result.reason === "expired" ? 
          PROTOCOL.ERROR_CODES.TOKEN_EXPIRED :
          PROTOCOL.ERROR_CODES.INVALID_TOKEN;
          
        return makeError(
          finalRequestId,
          PROTOCOL.COMMANDS.AUTH,
          errorCode,
          `Authentication failed: ${result.reason}`,
          { startedAt: startTime }
        );
      }

      // Autenticación exitosa - actualizar estado de conexión
      connState.authenticated = true;
      connState.tokenId = result.tokenId;
      connState.session = {
        tokenId: result.tokenId,
        scopes: result.scopes,
        authenticatedAt: Date.now(),
      };

      logger.info(`Authentication successful for ${connState.id} (token: ${result.tokenId})`);
      
      return makeResponse(
        finalRequestId, 
        PROTOCOL.COMMANDS.AUTH, 
        {
          authenticated: true,
          tokenId: result.tokenId,
          scopes: result.scopes,
        },
        startTime
      );

    } catch (error) {
      logger.error("Auth error:", error);
      return makeError(
        finalRequestId,
        PROTOCOL.COMMANDS.AUTH,
        PROTOCOL.ERROR_CODES.INTERNAL_ERROR,
        "Authentication failed",
        { startedAt: startTime }
      );
    }
  }

  /**
   * Maneja comandos de negocio
   */
  async handleBusinessCommand(connState, action, data, { startTime, requestId }) {
    const finalRequestId = requestId || data?.id || action.toLowerCase();

    // Verificar si el comando existe
    if (!isValidCommand(action)) {
      return makeError(
        finalRequestId,
        action,
        PROTOCOL.ERROR_CODES.UNKNOWN_ACTION,
        `Unknown action: ${action}`,
        { startedAt: startTime }
      );
    }

    // Obtener handler del comando
    const handler = getCommandHandler(action);
    if (!handler) {
      return makeError(
        finalRequestId,
        action,
        PROTOCOL.ERROR_CODES.INTERNAL_ERROR,
        "Command handler not found",
        { startedAt: startTime }
      );
    }

    try {
      // Ejecutar handler del comando
      const result = await handler(
        connState, 
        data, 
        { startTime },
        {
          mqttAdapter: this.mqttAdapter,
          db: this.db,
          captureQueue: this.captureQueue,
          config: this.config,
        }
      );

      // Convertir resultado a respuesta del protocolo
      if (result.success) {
        return makeResponse(
          finalRequestId,
          action,
          result.data || {},
          result.startTime || startTime
        );
      } else {
        return makeError(
          finalRequestId,
          action,
          result.errorCode || PROTOCOL.ERROR_CODES.INTERNAL_ERROR,
          result.errorMessage || "Command failed",
          { startedAt: result.startTime || startTime }
        );
      }

    } catch (error) {
      logger.error(`Command ${action} error:`, {
        message: error?.message || "Unknown error",
        stack: error?.stack,
        name: error?.name,
        code: error?.code,
        fullError: error
      });
      return makeError(
        finalRequestId,
        action,
        PROTOCOL.ERROR_CODES.INTERNAL_ERROR,
        error?.message || "Command execution failed",
        { startedAt: startTime }
      );
    }
  }
}
