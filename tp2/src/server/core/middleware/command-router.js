import { getCommand } from "../../business/index.js";
import {
  makeError,
  ErrorTemplates,
  PROTOCOL,
} from "../../../protocol/index.js";
import { hasScope } from "../../security/index.js";
import { logger } from "../../utils/logger.js";

/**
 * ============================================================================
 * COMMAND ROUTER
 * ============================================================================
 * Middleware final del pipeline: resuelve y ejecuta comandos de negocio.
 *
 * Flujo:
 *  1) Resolver comando por acción (act)
 *  2) Verificar scope/permisos
 *  3) Ejecutar handler del comando con un contexto acotado
 *  4) Responder OK o ERR (mapeando códigos de error consistentes)
 *  5) Cerrar la conexión si el comando lo requiere (p.ej. QUIT)
 *
 * Este middleware SIEMPRE consume la request (retorna false).
 */
export class CommandRouter {
  async process(context) {
    const { message, session } = context;

    // 1) Resolver comando
    const commandDef = getCommand(message.act);
    if (!commandDef) {
      context.reply(ErrorTemplates.unknownAction(message.id, message.act));
      return false;
    }

    // 2) Verificar permisos (scope) si aplica
    if (commandDef.scope && !hasScope(session, commandDef.scope)) {
      context.reply(
        ErrorTemplates.forbidden(message.id, message.act, commandDef.scope)
      );
      return false;
    }

    // 3) Ejecutar y manejar resultados/errores
    await this._executeCommand(context, commandDef);

    // El router siempre termina el pipeline (ya respondió OK/ERR)
    return false;
  }

  // ==========================================================================
  // PRIVATE
  // ==========================================================================

  /**
   * Ejecuta el handler del comando con manejo de errores uniforme.
   * - Construye un contexto de ejecución mínimo para evitar acoplar handlers al pipeline.
   * - Responde siempre (OK/ERR).
   */
  async _executeCommand(context, commandDef) {
    const { connection, message, session, db, startedAt } = context;

    try {
      // Contexto que reciben los handlers de negocio (acotado y estable)
      const handlerContext = {
        session,
        data: context.validatedData || message.data || {},
        db,
        socket: connection.socket,
        connection,
      };

      // Ejecutar comando
      const result = await commandDef.handler(handlerContext);

      // Responder OK (si el handler no devuelve nada, respondemos objeto vacío)
      context.reply(result ?? {});

      // Cerrar conexión si el comando lo requiere (ej: QUIT)
      if (commandDef.closeAfter) {
        connection.close();
      }
    } catch (error) {
      // Log estructurado para observabilidad
      logger.error("Command execution failed", {
        command: message.act,
        messageId: message.id,
        connectionId: connection.id,
        sessionId: session?.id,
        error: error?.message,
        stack: error?.stack,
      });

      // Mapeo de errores a códigos de protocolo:
      // 1) Preferimos error.code (handlers deberían setearlo)
      // 2) Fallback heurístico por mensaje (temporal)
      // 3) Default: INTERNAL_ERROR
      const { code, msg } = this._mapErrorToProtocol(error);

      context.reply(
        makeError(message.id, message.act, code, msg, { startedAt })
      );
    }
  }

  /**
   * Traduce un error arrojado por el handler a un código del protocolo.
   * Regla:
   * - Si error.code ∈ PROTOCOL.ERROR_CODES → usarlo (preferido)
   * - Si no, heurística por mensaje para BAD_REQUEST (temporal)
   * - Por defecto → INTERNAL_ERROR
   */
  _mapErrorToProtocol(error) {
    // Preferido: un handler prolijo setea error.code = PROTOCOL.ERROR_CODES.XXX
    if (
      error?.code &&
      Object.values(PROTOCOL.ERROR_CODES).includes(error.code)
    ) {
      return { code: error.code, msg: error.message || "Command error" };
    }

    // Fallback temporal: detección más específica por contenido del mensaje
    const m = String(error?.message || "").toLowerCase();
    const looksLikeBadRequest =
      m.includes("validation failed") ||
      m.includes("schema validation") ||
      m.includes("required field") ||
      m.includes("missing required") ||
      m.includes("malformed request") ||
      m.includes("bad request");

    if (looksLikeBadRequest) {
      return {
        code: PROTOCOL.ERROR_CODES.BAD_REQUEST,
        msg: error?.message || "Bad request",
      };
    }

    // Default: error interno
    return {
      code: PROTOCOL.ERROR_CODES.INTERNAL_ERROR,
      msg: "Internal server error",
    };
  }
}
