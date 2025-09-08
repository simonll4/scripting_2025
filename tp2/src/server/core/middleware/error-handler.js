import { makeError, PROTOCOL } from "../../../protocol/index.js";
import { logger } from "../../utils/logger.js";

/**
 * Error Handler
 * Responsabilidad: Manejar errores no capturados en el pipeline
 */
export class ErrorHandler {
  handle(connection, error, messageId = null, startedAt = null) {
    logger.error(`Pipeline error for connection ${connection.id}`, {
      error: error.message,
      stack: error.stack,
      connectionId: connection.id,
      sessionId: connection.session?.id,
    });

    // Si el error viene de transporte, el socket ya fue destruido
    // No intentar enviar respuesta, solo confiar en el cierre defensivo
    if (this._isTransportError(error)) {
      logger.warn("Transport error detected - socket already destroyed, skipping response");
      return;
    }

    try {
      // Usar messageId si está disponible, sino usar timestamp único
      const errorId = messageId || `error_${Date.now()}`;
      
      // Construir error response con observabilidad consistente
      const errorResponse = makeError(
        errorId,
        "PIPELINE",
        PROTOCOL.ERROR_CODES.INTERNAL_ERROR,
        "Internal server error",
        { startedAt: startedAt || Date.now() }
      );
      
      connection.send(errorResponse);
    } catch (sendError) {
      logger.error("Failed to send error response", {
        sendError: sendError.message,
      });
      connection.close();
    }
  }

  /**
   * Determina si un error viene del layer de transporte
   */
  _isTransportError(error) {
    return (
      error.message?.includes("transport-error") ||
      error.message?.includes("bad-frame") ||
      error.message?.includes("bad-json") ||
      error.code === "ECONNRESET" ||
      error.code === "EPIPE" ||
      error.code === "ENOTFOUND"
    );
  }
}
