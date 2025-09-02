import {
  PROTOCOL,
  makeResponse,
  ErrorTemplates,
} from "../../../protocol/index.js";
import { validateAuth, validateToken } from "../../utils/index.js";

/**
 * ============================================================================
 * AUTH GUARD MIDDLEWARE
 * ============================================================================
 * Responsabilidades:
 * - Procesar requests de AUTH (autenticación)
 * - Bloquear requests no-autenticados (excepto AUTH)
 * - Crear sesiones para tokens válidos
 * - Gestionar ciclo de vida de autenticación
 */
export class AuthGuard {
  constructor() {
    this.connectionManager = null;
  }

  /**
   * Inyecta el ConnectionManager para crear sesiones
   */
  setConnectionManager(connectionManager) {
    this.connectionManager = connectionManager;
  }

  async process(context) {
    const { message, session } = context;

    // Procesar request de autenticación
    if (message.act === PROTOCOL.CORE_ACTS.AUTH) {
      return await this._processAuth(context);
    }

    // Denegar acceso si no está autenticado
    if (!session) {
      context.reply(ErrorTemplates.unauthorized(message.id, message.act));
      return false;
    }

    // Usuario autenticado - continuar pipeline
    return true;
  }

  // ====================================
  // PRIVATE METHODS
  // ====================================

  /**
   * Procesa una request de autenticación (AUTH)
   */
  async _processAuth(context) {
    const { connection, message, db } = context;
    const authData = message.data ?? {};

    // Validar estructura del payload AUTH
    const validation = validateAuth(authData);
    if (!validation.valid) {
      const errors = validation.errors
        ?.map((err) => `${err.instancePath || "/"}: ${err.message}`)
        .slice(0, 3); // Max 3 errores para evitar spam

      context.reply(
        ErrorTemplates.badRequest(message.id, PROTOCOL.CORE_ACTS.AUTH, errors)
      );
      return false;
    }

    // Validar token contra la base de datos
    const tokenData = await validateToken(db, authData.token);
    if (!tokenData) {
      context.reply(
        ErrorTemplates.unauthorized(message.id, PROTOCOL.CORE_ACTS.AUTH)
      );
      context.close(); // Cerrar conexión por token inválido
      return false;
    }

    // Crear sesión autenticada
    const session = this.connectionManager.createSession(connection, {
      tokenId: tokenData.tokenId,
      scopes: tokenData.scopes,
    });

    // Responder con datos de sesión
    context.reply(
      makeResponse(message.id, PROTOCOL.CORE_ACTS.AUTH, {
        sessionId: session.id,
      })
    );

    // AUTH procesa completamente - no continuar pipeline
    return false;
  }
}
