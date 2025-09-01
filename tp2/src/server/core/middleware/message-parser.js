import { PROTOCOL, makeErr, assertEnvelope, ErrorTemplates } from "../../../protocol/index.js";

/**
 * Message Parser Middleware
 * Responsabilidad: Validar envelope básico (JSON ya viene parseado por setupTransportPipeline)
 */
export class MessageParser {
  async process(context) {
    try {
      // El mensaje ya viene parseado por setupTransportPipeline
      const rawMessage = context.message;

      if (!rawMessage) {
        throw new Error("No message received");
      }

      // Validar envelope mínimo
      assertEnvelope(rawMessage);

      return true; // Continuar pipeline
    } catch (error) {
      // Error de envelope inválido
      const errorResponse = ErrorTemplates.badRequest("0", "PARSE", error.message || "Invalid message format");
      context.reply(errorResponse);
      return false; // Cortar pipeline
    }
  }
}
