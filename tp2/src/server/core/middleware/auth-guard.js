import { PROTOCOL, makeResponse, makeError } from "../../../protocol/index.js";
import { validateAuth, validateToken } from "../../security/index.js";

/**
 * ============================================================================
 * AUTH GUARD
 * ============================================================================
 * Responsabilidades:
 * - Procesar requests de AUTH (autenticación inicial).
 * - Bloquear requests no autenticadas (excepto AUTH).
 * - Crear sesiones para tokens válidos.
 */
export class AuthGuard {
  constructor() {
    this.connectionManager = null;
  }

  // Inyectar ConnectionManager para poder crear sesiones
  setConnectionManager(connectionManager) {
    this.connectionManager = connectionManager;
  }

  /**
   * Entrada principal del middleware
   */
  async process(context) {
    const { message, session, startedAt } = context;

    // --- Caso 1: request de AUTH ---
    if (message.act === PROTOCOL.CORE_ACTS.AUTH) {
      return await this._processAuth(context);
    }

    // --- Caso 2: request normal sin sesión → denegar ---
    if (!session) {
      context.reply(
        makeError(
          message.id,
          message.act,
          PROTOCOL.ERROR_CODES.UNAUTHORIZED,
          "Authentication required",
          { startedAt }
        )
      );
      return false;
    }

    // --- Caso 3: autenticado → continuar pipeline ---
    return true;
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Procesa específicamente una request de AUTH
   */
  async _processAuth(context) {
    const { connection, message, db, startedAt } = context;
    const authData = message.data ?? {};

    // 1) Validar payload con schema AJV
    const validation = validateAuth(authData);
    if (!validation.valid) {
      const errors = validation.errors
        ?.map((err) => `${err.instancePath || "/"}: ${err.message}`)
        .slice(0, 3); // limitar ruido

      context.reply(
        makeError(
          message.id,
          PROTOCOL.CORE_ACTS.AUTH,
          PROTOCOL.ERROR_CODES.BAD_REQUEST,
          "Invalid AUTH payload",
          { details: errors, startedAt }
        )
      );
      return false;
    }

    // 2) Validar token contra la DB
    let tokenResult = null;
    try {
      tokenResult = await validateToken(db, authData.token);
    } catch {
      // Error interno al consultar DB
      context.reply(
        makeError(
          message.id,
          PROTOCOL.CORE_ACTS.AUTH,
          PROTOCOL.ERROR_CODES.INTERNAL_ERROR,
          "Auth backend error",
          { startedAt }
        )
      );
      return false;
    }

    // --- Validar resultado del token ---
    if (!tokenResult.ok) {
      // Mapear razones específicas a códigos de error apropiados
      switch (tokenResult.reason) {
        case "expired":
          context.reply(
            makeError(
              message.id,
              PROTOCOL.CORE_ACTS.AUTH,
              PROTOCOL.ERROR_CODES.TOKEN_EXPIRED,
              "Token expired",
              {
                retryAfterMs: 3600000, // 1 hora por defecto
                startedAt,
              }
            )
          );
          break;

        case "not_found":
        case "revoked":
        case "invalid_secret":
        default:
          context.reply(
            makeError(
              message.id,
              PROTOCOL.CORE_ACTS.AUTH,
              PROTOCOL.ERROR_CODES.INVALID_TOKEN,
              "Invalid token",
              { startedAt }
            )
          );
          break;
      }
      return false;
    }

    // 3) Crear sesión autenticada asociada a la conexión
    const session = this.connectionManager.createSession(connection, {
      tokenId: tokenResult.tokenId,
      scopes: tokenResult.scopes || [],
      expiresAt:
        typeof tokenResult.expiresAt === "number"
          ? tokenResult.expiresAt
          : undefined,
    });

    // 4) Responder OK → AUTH consume la request
    context.reply(
      makeResponse(
        message.id,
        PROTOCOL.CORE_ACTS.AUTH,
        {
          sessionId: session.id,
          scopes: session.scopes,
          expiresAt: session.expiresAt ?? null,
        },
        startedAt
      )
    );

    return false; // cortamos el pipeline (ya respondimos)
  }
}
