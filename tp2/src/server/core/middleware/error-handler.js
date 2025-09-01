import { PROTOCOL, makeErr, ErrorTemplates } from "../../../protocol/index.js";
import { logger } from "../../utils/logger.js";

/**
 * Error Handler
 * Responsabilidad: Manejar errores no capturados en el pipeline
 */
export class ErrorHandler {
  handle(connection, error, messageId = null) {
    logger.error(`Pipeline error for connection ${connection.id}`, {
      error: error.message,
      stack: error.stack,
      connectionId: connection.id,
      sessionId: connection.session?.id
    });

    try {
      // Usar messageId si está disponible, sino usar timestamp único
      const errorId = messageId || `error_${Date.now()}`;
      const errorResponse = ErrorTemplates.internalError(errorId, "PIPELINE");
      connection.send(errorResponse);
    } catch (sendError) {
      logger.error("Failed to send error response", { sendError: sendError.message });
      connection.close();
    }
  }
}
