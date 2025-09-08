import {
  validateRequestEnvelope,
  makeError,
  PROTOCOL,
} from "../../../protocol/index.js";

/**
 * ============================================================================
 * MESSAGE VALIDATOR
 * ============================================================================
 * Responsabilidad: Validar que el mensaje tenga la estructura correcta
 */
export class MessageValidator {
  async process(context) {
    const { message, startedAt } = context;

    // Verificar que existe el mensaje
    if (!message) {
      const errorResponse = makeError(
        "0",
        "VALIDATE",
        PROTOCOL.ERROR_CODES.BAD_REQUEST,
        "No message received",
        { startedAt }
      );
      context.reply(errorResponse);
      return false;
    }

    // Validar envelope del protocolo 
    try {
      validateRequestEnvelope(message);
      return true; // Continuar al siguiente middleware
    } catch (error) {
      const errorResponse = makeError(
        message.id || "0",
        message.act || "VALIDATE",
        PROTOCOL.ERROR_CODES.BAD_REQUEST,
        error.message || "Invalid message structure",
        { startedAt }
      );
      context.reply(errorResponse);
      return false; // Cortar pipeline
    }
  }
}
