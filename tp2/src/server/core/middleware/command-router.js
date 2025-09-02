import { getCommand } from "../../business/index.js";
import { makeResponse, ErrorTemplates } from "../../../protocol/index.js";
import { hasScope } from "../../utils/index.js";
import { logger } from "../../utils/logger.js";

/**
 * ============================================================================
 * COMMAND ROUTER MIDDLEWARE
 * ============================================================================
 * Middleware final que ejecuta comandos de negocio.
 *
 * Responsabilidades:
 * 1. Resolver comando por acción (act)
 * 2. Verificar permisos (scopes) del usuario
 * 3. Ejecutar handler con contexto completo
 * 4. Manejar respuesta exitosa o errores
 * 5. Cerrar conexión si el comando lo requiere
 *
 * Siempre termina el pipeline (return false).
 */
export class CommandRouter {
  async process(context) {
    const { connection, message, session, db } = context;

    // 1. Buscar definición del comando
    const commandDef = getCommand(message.act);
    if (!commandDef) {
      context.reply(ErrorTemplates.unknownAction(message.id, message.act));
      return false;
    }

    // 2. Verificar permisos (scope) si el comando lo requiere
    if (commandDef.scope && !hasScope(session, commandDef.scope)) {
      context.reply(
        ErrorTemplates.forbidden(message.id, message.act, commandDef.scope)
      );
      return false;
    }

    // 3. Ejecutar comando
    await this._executeCommand(context, commandDef);

    return false; // Router siempre termina el pipeline
  }

  // ====================================
  // PRIVATE METHODS
  // ====================================

  /**
   * Ejecuta un comando con manejo de errores
   */
  async _executeCommand(context, commandDef) {
    const { connection, message, session, db } = context;

    try {
      // Preparar contexto para el handler del comando
      const handlerContext = {
        session,
        data: context.validatedData || message.data || {},
        db,
        socket: connection.socket,
        connection,
      };

      // Ejecutar handler del comando
      const result = await commandDef.handler(handlerContext);

      // Responder con resultado exitoso
      context.reply(makeResponse(message.id, message.act, result ?? {}));

      // Cerrar conexión si el comando lo requiere (ej: QUIT)
      if (commandDef.closeAfter) {
        connection.close();
      }
    } catch (error) {
      // Log detallado del error para debugging
      logger.error(`Command execution failed`, {
        command: message.act,
        messageId: message.id,
        connectionId: connection.id,
        sessionId: session?.id,
        error: error.message,
        stack: error.stack,
      });

      // Responder con error genérico al cliente
      context.reply(ErrorTemplates.internalError(message.id, message.act));
    }
  }
}
