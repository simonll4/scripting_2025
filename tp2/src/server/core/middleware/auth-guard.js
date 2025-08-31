import { PROTOCOL, makeErr, makeRes, validateAuth } from "../../utils/index.js";
import { validateToken } from "../../utils/index.js";

/**
 * Auth Guard Middleware
 * Responsabilidades:
 * - Interceptar y procesar requests de AUTH
 * - Verificar que conexiones no-autenticadas solo puedan hacer AUTH
 * - Gestionar ciclo de vida de sesiones
 * - Validar payload AUTH usando helper directo (no módulo)
 */
export class AuthGuard {
  constructor() {
    // Inyección de dependencia del ConnectionManager para crear sesiones
    this.connectionManager = null;
  }

  setConnectionManager(connectionManager) {
    this.connectionManager = connectionManager;
  }

  async process(context) {
    const { message, session } = context;

    // Si es una request de AUTH, procesarla
    if (message.act === PROTOCOL.CORE_ACTS.AUTH) {
      return await this._processAuth(context);
    }

    // Si no hay sesión pero se requiere para este comando, denegar
    if (!session) {
      context.reply(
        makeErr(
          message.id,
          message.act,
          PROTOCOL.ERROR_CODES.UNAUTHORIZED,
          "Authentication required"
        )
      );
      return false;
    }

    // Autenticado - continuar
    return true;
  }

  async _processAuth(context) {
    const { connection, message, db } = context;
    const authData = message.data ?? {};

    // Validar payload de AUTH usando el helper directo
    const validation = validateAuth(authData);

    if (!validation.valid) {
      const errorDetails = validation.errors
        ?.map(err => `${err.instancePath || '/'}: ${err.message}`)
        .slice(0, 5);

      context.reply(
        makeErr(
          message.id,
          PROTOCOL.CORE_ACTS.AUTH,
          PROTOCOL.ERROR_CODES.BAD_REQUEST,
          "Invalid AUTH payload",
          errorDetails
        )
      );
      return false;
    }

    // Validar token
    const tokenData = await validateToken(db, authData.token);
    if (!tokenData) {
      const errorResponse = makeErr(
        message.id,
        PROTOCOL.CORE_ACTS.AUTH,
        PROTOCOL.ERROR_CODES.INVALID_TOKEN,
        "Invalid, expired, or revoked token"
      );
      context.close(errorResponse);
      return false;
    }

    // Crear sesión
    const session = this.connectionManager.createSession(connection, {
      tokenId: tokenData.tokenId,
      scopes: tokenData.scopes,
    });

    // Responder exitosamente
    context.reply(
      makeRes(message.id, PROTOCOL.CORE_ACTS.AUTH, {
        sessionId: session.id,
        scopes: session.scopes,
      })
    );

    // AUTH se procesa completamente aquí - no continuar el pipeline
    return false;
  }
}
