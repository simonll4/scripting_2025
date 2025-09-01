import { getCommand } from "../../business/index.js";
import { PROTOCOL, makeErr, makeRes, ErrorTemplates } from "../../../protocol/index.js";
import { hasScope } from "../../utils/index.js";
import { logger } from "../../utils/logger.js";

/**
 * Command Router Middleware
 * Responsabilidades:
 * - Resolver comando basado en action
 * - Verificar autorización por scope
 * - Ejecutar handler del comando
 * - Manejar respuesta y cleanup
 */
export class CommandRouter {
  async process(context) {
    const { connection, message, session, db } = context;

    // 1. Resolver definición del comando
    const commandDef = getCommand(message.act);
    if (!commandDef) {
      context.reply(ErrorTemplates.unknownAction(message.id, message.act));
      return false;
    }

    // 2. Verificar autorización por scope
    if (commandDef.scope && !hasScope(session, commandDef.scope)) {
      context.reply(ErrorTemplates.forbidden(message.id, message.act, commandDef.scope));
      return false;
    }

    // 3. Ejecutar handler del comando
    try {
      const handlerContext = {
        session,
        data: context.validatedData || message.data || {},
        db,
        socket: connection.socket,
        connection,
      };

      const result = await commandDef.handler(handlerContext);

      // 4. Responder con resultado exitoso
      context.reply(makeRes(message.id, message.act, result ?? {}));

      // 5. Cerrar conexión si el comando lo requiere
      if (commandDef.closeAfter) {
        connection.close();
      }
    } catch (error) {
      // 6. Manejar errores del handler
      logger.error(`Command ${message.act} failed`, {
        error: error.message,
        stack: error.stack,
        messageId: message.id,
        connectionId: connection.id
      });

      context.reply(ErrorTemplates.internalError(message.id, message.act));
    }

    return false; // Router siempre termina el pipeline
  }
}
