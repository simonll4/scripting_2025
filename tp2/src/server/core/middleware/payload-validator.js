import { validatePayload } from "../../business/index.js";
import { PROTOCOL, makeErr, ErrorTemplates } from "../../../protocol/index.js";

/**
 * Payload Validator Middleware
 * Responsabilidad: Validar payloads usando esquemas AJV
 */
export class PayloadValidator {
  async process(context) {
    const { message } = context;
    const data = message.data ?? {};

    // Validar usando el nuevo sistema
    const validation = validatePayload(message.act, data);

    // Si la validación falla, enviar error
    if (!validation.valid) {
      const errorDetails = validation.errors
        ?.map(err => `${err.instancePath || '/'}: ${err.message}`)
        .slice(0, 5);

      context.reply(ErrorTemplates.badRequest(message.id, message.act, errorDetails));
      return false;
    }

    // Añadir data validada al context
    context.validatedData = data;

    return true;
  }
}
