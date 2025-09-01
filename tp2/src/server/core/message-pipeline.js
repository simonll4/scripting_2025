import { MessageParser } from "./middleware/message-parser.js";
import { RateLimiter } from "./middleware/rate-limiter.js";
import { AuthGuard } from "./middleware/auth-guard.js";
import { PayloadValidator } from "./middleware/payload-validator.js";
import { CommandRouter } from "./middleware/command-router.js";
import { ErrorHandler } from "./middleware/error-handler.js";
import { touchSession } from "../utils/index.js";

/**
 * Message Pipeline - Implementa patrón Chain of Responsibility
 * Cada middleware tiene una responsabilidad específica y puede:
 * - Procesar el mensaje y pasarlo al siguiente
 * - Responder inmediatamente y cortar la cadena
 * - Manejar errores
 */
export class MessagePipeline {
  constructor(connectionManager, db) {
    this.connectionManager = connectionManager;
    this.db = db;

    // Orden crítico: parseo -> rate limiting -> auth -> validación -> routing
    this.middlewares = [
      new MessageParser(),
      new RateLimiter(),
      new AuthGuard(),
      new PayloadValidator(),
      new CommandRouter(),
    ];

    // Configurar dependencias
    this.middlewares[2].setConnectionManager(connectionManager); // AuthGuard

    this.errorHandler = new ErrorHandler();
  }

  setup(connection) {
    // setupTransportPipeline ya emite evento "message" con JSON parseado
    connection.socket.on("message", async (message) => {
      await this.process(connection, message);
    });

    // Manejar errores de transporte
    connection.socket.on("transport-error", (error) => {
      this.errorHandler.handle(connection, error);
    });
  }

  async process(connection, message) {
    try {
      const context = this._createContext(connection, message);

      // Actualizar timestamp de último uso de la sesión
      if (context.session) {
        touchSession(context.session);
      }

      // Ejecutar middleware chain
      for (const middleware of this.middlewares) {
        const shouldContinue = await middleware.process(context);
        if (!shouldContinue) {
          return; // Middleware cortó la ejecución
        }
      }
    } catch (error) {
      this.errorHandler.handle(connection, error, message?.id);
    }
  }

  _createContext(connection, message) {
    return {
      connection,
      message,
      session: connection.session,
      db: this.db,
      // Helper methods
      reply: (response) => connection.send(response), // Enviar respuesta al cliente
      close: (message) => connection.close(message), // Cerrar conexión
    };
  }
}
