import { PROTOCOL, makeErr } from "../../utils/index.js";

/**
 * Error Handler
 * Responsabilidad: Manejar errores no capturados en el pipeline
 */
export class ErrorHandler {
  handle(connection, error) {
    console.error(`Pipeline error for connection ${connection.id}:`, {
      error: error.message,
      stack: error.stack,
      connectionId: connection.id,
      sessionId: connection.session?.id
    });

    try {
      const errorResponse = makeErr(
        "0",
        "PIPELINE",
        PROTOCOL.ERROR_CODES.INTERNAL_ERROR,
        "Internal pipeline error"
      );
      
      connection.send(errorResponse);
    } catch (sendError) {
      console.error("Failed to send error response:", sendError);
      connection.close();
    }
  }
}
