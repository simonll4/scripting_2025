import { MessageParser } from "./middleware/message-parser.js";
import { RateLimiter } from "./middleware/rate-limiter.js";
import { AuthGuard } from "./middleware/auth-guard.js";
import { PayloadValidator } from "./middleware/payload-validator.js";
import { CommandRouter } from "./middleware/command-router.js";
import { ErrorHandler } from "./middleware/error-handler.js";

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
    connection.deframer.on("data", async (payload) => {
      await this.process(connection, payload);
    });
  }

  async process(connection, payload) {
    try {
      const context = this._createContext(connection, payload);

      // Ejecutar middleware chain
      for (const middleware of this.middlewares) {
        const shouldContinue = await middleware.process(context);
        if (!shouldContinue) {
          return; // Middleware cortó la ejecución
        }
      }
    } catch (error) {
      this.errorHandler.handle(connection, error);
    }
  }

  _createContext(connection, payload) {
    return {
      connection,
      payload,
      message: null,
      session: connection.session,
      db: this.db,
      // Helper methods
      reply: (response) => connection.send(response), // Enviar respuesta al cliente
      close: (message) => connection.close(message), // Cerrar conexión
    };
  }
}
