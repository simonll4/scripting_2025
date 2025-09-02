import { validatePayload } from "../../business/index.js";
import { PROTOCOL, ErrorTemplates } from "../../../protocol/index.js";

/**
 * ============================================================================
 * PAYLOAD VALIDATOR MIDDLEWARE
 * ============================================================================
 * Responsabilidad: Validar payloads de comandos usando esquemas AJV.
 * Si no hay schema definido para un comando, se omite la validación.
 */
export class PayloadValidator {
  async process(context) {
    const { message } = context;

    // Saltear AUTH - ya validado en AuthGuard
    if (message.act === PROTOCOL.CORE_ACTS.AUTH) {
      return true;
    }

    const data = message.data ?? {};

    // Validar payload contra schema del comando
    const validation = validatePayload(message.act, data);

    if (!validation.valid) {
      const errors = validation.errors
        ?.map((err) => `${err.instancePath || "/"}: ${err.message}`)
        .slice(0, 3); // Limitar errores mostrados

      context.reply(ErrorTemplates.badRequest(message.id, message.act, errors));
      return false; // Cortar pipeline por validación fallida
    }

    // Agregar data validada al contexto para CommandRouter
    context.validatedData = data;

    return true; // Continuar pipeline
  }
}
