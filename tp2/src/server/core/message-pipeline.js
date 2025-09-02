import { MessageValidator } from "./middleware/message-validator.js";
import { RateLimiter } from "./middleware/rate-limiter.js";
import { AuthGuard } from "./middleware/auth-guard.js";
import { PayloadValidator } from "./middleware/payload-validator.js";
import { CommandRouter } from "./middleware/command-router.js";
import { ErrorHandler } from "./middleware/error-handler.js";
import { touchSession } from "../utils/index.js";

/**
 * ============================================================================
 * MESSAGE PIPELINE
 * ============================================================================
 * Implementa patrón Chain of Responsibility para procesar mensajes.
 *
 * Flujo de procesamiento:
 * 1. MessageValidator - Validar estructura del mensaje (envelope)
 * 2. RateLimiter     - Control de velocidad por conexión/acción
 * 3. AuthGuard       - Autenticación y autorización
 * 4. PayloadValidator - Validar payload específico del comando
 * 5. CommandRouter   - Ejecutar comando correspondiente
 *
 * Cada middleware puede:
 * - Procesar y continuar al siguiente
 * - Responder y cortar la cadena
 * - Lanzar error para manejo centralizado
 */
export class MessagePipeline {
  constructor(connectionManager, db) {
    this.db = db;
    this.errorHandler = new ErrorHandler();

    // Inicializar middlewares con dependencias
    const authGuard = new AuthGuard();
    authGuard.setConnectionManager(connectionManager);

    // Pipeline en orden crítico de ejecución
    this.middlewares = [
      new MessageValidator(),
      new RateLimiter(),
      authGuard,
      new PayloadValidator(),
      new CommandRouter(),
    ];
  }

  /**
   * Configura los event handlers para una conexión nueva
   */
  setup(connection) {
    // El transport pipeline ya emite "message" con JSON parseado
    connection.socket.on("message", async (message) => {
      await this.process(connection, message);
    });

    // Manejo de errores de transporte
    connection.socket.on("transport-error", (error) => {
      this.errorHandler.handle(connection, error);
    });
  }

  /**
   * Procesa un mensaje a través del pipeline de middlewares
   */
  async process(connection, message) {
    try {
      const context = this._createContext(connection, message);

      // Actualizar timestamp de sesión si existe
      if (context.session) {
        touchSession(context.session);
      }

      // Ejecutar pipeline de middlewares
      for (const middleware of this.middlewares) {
        const shouldContinue = await middleware.process(context);
        if (!shouldContinue) {
          return; // Middleware terminó el procesamiento
        }
      }
    } catch (error) {
      this.errorHandler.handle(connection, error, message?.id);
    }
  }

  // ====================================
  // PRIVATE METHODS
  // ====================================

  /**
   * Crea el contexto que se pasa a cada middleware
   */
  _createContext(connection, message) {
    return {
      connection,
      message,
      session: connection.session,
      db: this.db,
      // Helper methods para respuestas
      reply: (response) => connection.send(response),
      close: (message) => connection.close(message),
    };
  }
}
