import {
  validateMessageEnvelope,
  ErrorTemplates,
} from "../../../protocol/index.js";

/**
 * ============================================================================
 * MESSAGE VALIDATOR MIDDLEWARE
 * ============================================================================
 * Responsabilidad: Validar que el mensaje tenga la estructura correcta
 * del protocolo (envelope básico: id, act, data, etc.)
 */
export class MessageValidator {
  async process(context) {
    const { message } = context;

    // Verificar que existe el mensaje
    if (!message) {
      const errorResponse = ErrorTemplates.badRequest(
        "0", 
        "VALIDATE", 
        "No message received"
      );
      context.reply(errorResponse);
      return false;
    }

    // Validar envelope del protocolo (id, act, data structure)
    try {
      validateMessageEnvelope(message);
      return true; // Continuar al siguiente middleware
    } catch (error) {
      const errorResponse = ErrorTemplates.badRequest(
        message.id || "0",
        "VALIDATE",
        error.message || "Invalid message structure"
      );
      context.reply(errorResponse);
      return false; // Cortar pipeline
    }
  }
}
