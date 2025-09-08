import { MessageValidator } from "./middleware/message-validator.js";
import { RateLimiter } from "./middleware/rate-limiter.js";
import { AuthGuard } from "./middleware/auth-guard.js";
import { PayloadValidator } from "./middleware/payload-validator.js";
import { CommandRouter } from "./middleware/command-router.js";
import { ErrorHandler } from "./middleware/error-handler.js";
import { touchSession } from "../security/index.js";

import {
  PROTOCOL,
  makeHello,
  makeResponse,
  makeError,
  validateRequestEnvelope,
  isPing,
  isPong,
  makePong,
} from "../../protocol/index.js";

/**
 * ============================================================================
 * MESSAGE PIPELINE
 * ============================================================================
 * Flujo de cada conexión:
 * 1. Al conectarse → enviar HELLO con límites/hints.
 * 2. Mantener heartbeats app-level (PING/PONG).
 * 3. Procesar mensajes en pipeline de middlewares.
 * 4. Manejo de errores y timeouts de comandos.
 * ============================================================================
 */
export class MessagePipeline {
  constructor(connectionManager, db) {
    this.db = db;
    this.errorHandler = new ErrorHandler();

    // --- Middlewares en orden crítico ---
    const authGuard = new AuthGuard();
    authGuard.setConnectionManager(connectionManager);

    this.middlewares = [
      new MessageValidator(), // valida formato de mensaje
      new RateLimiter(), // controla rate limiting
      authGuard, // chequea autenticación/token
      new PayloadValidator(), // valida schema del payload
      new CommandRouter(), // ejecuta comando
    ];
  }

  /**
   * ==========================================================================
   * CONFIGURACIÓN DE NUEVA CONEXIÓN
   * ==========================================================================
   */
  setup(connection) {
    const { socket } = connection;

    // --- Estado inicial por conexión ---
    connection._inFlight = 0;
    connection._hb = {
      timer: null,
      missed: 0,
      lastActivity: Date.now(),
    };

    // --- Enviar HELLO inicial con hints ---
    const hello = makeHello({
      maxFrame: PROTOCOL.LIMITS.MAX_FRAME,
      maxPayload: PROTOCOL.LIMITS.MAX_PAYLOAD_BYTES,
      heartbeatMs: PROTOCOL.LIMITS.HEARTBEAT_MS,
      maxInFlight: PROTOCOL.LIMITS.MAX_IN_FLIGHT,
      serverVersion: PROTOCOL.VERSION,
    });
    connection.send(hello);

    // --- Configuración heartbeat (app-level) ---
    const hbIntervalMs = Math.max(
      5_000,
      Math.floor(PROTOCOL.LIMITS.HEARTBEAT_MS / 2)
    );

    connection._hb.timer = setInterval(() => {
      const idle = Date.now() - connection._hb.lastActivity;
      if (idle < hbIntervalMs) return; // hubo actividad reciente

      // Emitimos PING
      connection.send({ v: PROTOCOL.VERSION, t: PROTOCOL.TYPES.PING });
      connection._hb.missed += 1;

      // Si no recibimos PONG en 2 intervalos → cerramos
      if (connection._hb.missed >= 2) {
        connection.close({
          v: PROTOCOL.VERSION,
          t: PROTOCOL.TYPES.SRV_CLOSE,
          data: { code: "HEARTBEAT_TIMEOUT", reason: "missing PONG" },
        });
      }
    }, hbIntervalMs);

    // --- Limpieza al cerrar ---
    socket.on("close", () => {
      if (connection._hb.timer) clearInterval(connection._hb.timer);
    });

    // --- Recepción de mensajes ---
    socket.on("message", async (message) => {
      connection._hb.lastActivity = Date.now();
      connection._hb.missed = 0; // reset counter

      // Manejo PING/PONG básicos
      if (isPing(message)) {
        connection.send(makePong());
        return;
      }
      if (isPong(message)) {
        connection._hb.missed = 0;
        return;
      }

      await this.process(connection, message);
    });

    // --- Errores de transporte ---
    socket.on("transport-error", (error) => {
      this.errorHandler.handle(connection, error);
    });
  }

  /**
   * ==========================================================================
   * PROCESAMIENTO DE MENSAJES (REQ)
   * ==========================================================================
   */
  async process(connection, message) {
    const startedAt = Date.now();

    // --- Sólo procesamos requests (REQ) ---
    if (message?.t !== PROTOCOL.TYPES.REQ) return;

    // --- Validar envelope básico ---
    try {
      validateRequestEnvelope(message);
    } catch (e) {
      connection.send(
        makeError(
          message?.id,
          message?.act,
          PROTOCOL.ERROR_CODES.BAD_REQUEST,
          e.message,
          { startedAt }
        )
      );
      return;
    }

    // --- Límite de concurrencia (in-flight) ---
    if (connection._inFlight >= PROTOCOL.LIMITS.MAX_IN_FLIGHT) {
      connection.send(
        makeError(
          message.id,
          message.act,
          PROTOCOL.ERROR_CODES.TOO_MANY_IN_FLIGHT,
          "Too many in-flight requests",
          { retryAfterMs: PROTOCOL.LIMITS.HEARTBEAT_MS, startedAt }
        )
      );
      return;
    }

    // --- Defensa contra payloads gigantes ---
    try {
      const dataBytes = Buffer.byteLength(
        JSON.stringify(message.data ?? {}),
        "utf8"
      );
      if (dataBytes > PROTOCOL.LIMITS.MAX_PAYLOAD_BYTES) {
        connection.send(
          makeError(
            message.id,
            message.act,
            PROTOCOL.ERROR_CODES.PAYLOAD_TOO_LARGE,
            `Payload too large (${dataBytes}B > ${PROTOCOL.LIMITS.MAX_PAYLOAD_BYTES}B)`,
            { startedAt }
          )
        );
        return;
      }
    } catch {
      connection.send(
        makeError(
          message.id,
          message.act,
          PROTOCOL.ERROR_CODES.BAD_REQUEST,
          "Invalid JSON payload",
          { startedAt }
        )
      );
      return;
    }

    // --- Contexto para middlewares ---
    const context = this._createContext(connection, message, startedAt);
    if (context.session) touchSession(context.session);

    // --- Deadline por comando ---
    // Cada request tiene un tiempo máximo permitido (CMD_TIMEOUT_MS).
    // Si el pipeline no responde antes, devolvemos DEADLINE_EXCEEDED automáticamente.
    let deadlineTimer;
    const deadlineMs = PROTOCOL.LIMITS.CMD_TIMEOUT_MS;

    try {
      connection._inFlight += 1;

      // Creamos una promesa que se rechaza si pasa el tiempo límite
      const deadlinePromise = new Promise((_, reject) => {
        deadlineTimer = setTimeout(() => {
          const err = new Error("Command deadline exceeded");
          err.code = PROTOCOL.ERROR_CODES.DEADLINE_EXCEEDED;
          reject(err);
        }, deadlineMs);
      });

      // --- Ejecutar pipeline de middlewares ---
      const runPipeline = (async () => {
        for (const middleware of this.middlewares) {
          const shouldContinue = await middleware.process(context);
          if (!shouldContinue) return; // middleware respondió y corta
        }
        // Ningún middleware respondió → 500
        context.reply(
          makeError(
            message.id,
            message.act,
            PROTOCOL.ERROR_CODES.INTERNAL_ERROR,
            "No middleware produced a response",
            { startedAt }
          )
        );
      })();

      await Promise.race([runPipeline, deadlinePromise]);
    } catch (error) {
      // --- Deadline u otros errores globales ---
      const code = error?.code || PROTOCOL.ERROR_CODES.INTERNAL_ERROR;
      const errMsg =
        code === PROTOCOL.ERROR_CODES.DEADLINE_EXCEEDED
          ? "Command deadline exceeded"
          : error?.message || "Internal server error";

      context.reply(
        makeError(message.id, message.act, code, errMsg, { startedAt })
      );
    } finally {
      if (deadlineTimer) clearTimeout(deadlineTimer);
      connection._inFlight = Math.max(0, connection._inFlight - 1);
    }
  }

  /**
   * ==========================================================================
   * CONTEXTO PARA MIDDLEWARES
   * ==========================================================================
   */
  _createContext(connection, message, startedAt) {
    return {
      connection,
      message,
      session: connection.session,
      db: this.db,
      startedAt,
      // Helpers
      reply: (dataOrMsg) => {
        if (dataOrMsg && dataOrMsg.t) {
          return connection.send(dataOrMsg); // envelope completo
        }
        return connection.send(
          makeResponse(message.id, message.act, dataOrMsg, startedAt)
        );
      },
      close: (closeMsg) => connection.close(closeMsg),
    };
  }
}
