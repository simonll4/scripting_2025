import { getCommand } from "../../modules/index.js";
import { hasScope, PROTOCOL, makeErr, makeRes } from "../../utils/index.js";

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
      context.reply(
        makeErr(
          message.id,
          message.act,
          PROTOCOL.ERROR_CODES.UNKNOWN_ACTION,
          `Command '${message.act}' not implemented`
        )
      );
      return false;
    }

    // 2. Verificar autorización por scope
    if (commandDef.scope && !hasScope(session, commandDef.scope)) {
      context.reply(
        makeErr(
          message.id,
          message.act,
          PROTOCOL.ERROR_CODES.FORBIDDEN,
          `Required scope: ${commandDef.scope}`
        )
      );
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
      console.error(`Command ${message.act} failed:`, error);

      context.reply(
        makeErr(
          message.id,
          message.act,
          PROTOCOL.ERROR_CODES.INTERNAL_ERROR,
          error.message || "Internal server error"
        )
      );
    }

    return false; // Router siempre termina el pipeline
  }
}
