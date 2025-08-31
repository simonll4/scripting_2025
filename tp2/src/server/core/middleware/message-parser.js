import { PROTOCOL, makeErr, assertEnvelope } from "../../utils/index.js";

/**
 * Message Parser Middleware
 * Responsabilidad: Parsear JSON y validar envelope básico
 */
export class MessageParser {
  async process(context) {
    try {
      // Parse JSON
      const rawMessage = JSON.parse(context.payload.toString("utf8"));

      // Validar envelope mínimo
      assertEnvelope(rawMessage);

      // Añadir al context para próximos middlewares
      context.message = rawMessage;

      return true; // Continuar pipeline
    } catch (error) {
      // Error de parsing o envelope inválido
      const errorResponse = makeErr(
        "0",
        "PARSE",
        PROTOCOL.ERROR_CODES.BAD_REQUEST,
        error.message || "Invalid message format"
      );

      context.reply(errorResponse);
      return false; // Cortar pipeline
    }
  }
}
