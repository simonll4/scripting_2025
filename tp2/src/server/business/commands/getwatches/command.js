import { SCOPES } from "../../../security/index.js";
import { PROTOCOL } from "../../../../protocol/index.js";
import { logger } from "../../../utils/logger.js";
import { getWatchMeta, getWatchEventsPage } from "../../../db/db.js";

// ============================================================================
// Helpers & Consts
// ============================================================================

const HARD_MAX = 20_000;

/** Entero seguro dentro de [min, max] */
function clamp(n, min, max) {
  const x = Number.isFinite(n) ? Math.floor(n) : min;
  return Math.max(min, Math.min(x, max));
}

/** Decodifica un cursor base64 a { ts:number, id:number } o null */
function decodeCursor(cursor) {
  try {
    const json = Buffer.from(cursor, "base64").toString("utf8");
    const obj = JSON.parse(json);
    if (typeof obj.ts === "number" && typeof obj.id === "number") return obj;
  } catch (_) {}
  return null;
}

/** Codifica { ts, id } a cursor base64 */
function encodeCursor(ts, id) {
  return Buffer.from(JSON.stringify({ ts, id }), "utf8").toString("base64");
}

/** Normaliza el valor de orden, default 'asc' */
function normalizeOrder(order) {
  return order === "desc" ? "desc" : "asc";
}

// ============================================================================
// Command: getwatches
// ============================================================================

export default {
  scope: SCOPES.GET_WATCHES,
  closeAfter: false,

  /**
   * Handler del comando:
   *   data: {
   *     token: string (requerido),
   *     since?: number (epoch ms),
   *     until?: number (epoch ms),
   *     pageSize?: number (default 1000),
   *     order?: 'asc'|'desc' (default 'asc'),
   *     cursor?: string (paginación stateful)
   *   }
   */
  handler: async ({ db, data }) => {
    // ==========================
    // 1) Parseo & normalización
    // ==========================
    const {
      token,
      since: rawSince,
      until: rawUntil,
      pageSize = 1000,
      order: rawOrder = "asc",
      cursor,
    } = data || {};

    const limit = clamp(pageSize, 1, HARD_MAX);
    const order = normalizeOrder(rawOrder);
    const cursorData = cursor ? decodeCursor(cursor) : null;

    // Normalizar ventana temporal
    let since = typeof rawSince === "number" ? rawSince : undefined;
    let until = typeof rawUntil === "number" ? rawUntil : undefined;
    if (
      typeof since === "number" &&
      typeof until === "number" &&
      since > until
    ) {
      [since, until] = [until, since];
    }

    // ==========================
    // 2) Validaciones mínimas
    // ==========================
    if (!token || typeof token !== "string") {
      return {
        error: "BAD_REQUEST",
        message: "El campo 'token' es requerido y debe ser string.",
      };
    }

    // Validar que exista el watch
    const meta = await getWatchMeta(db, token);
    if (!meta) {
      return {
        error: "UNKNOWN_TOKEN",
        message: `No existe watch con token=${token}`,
      };
    }

    // ==========================
    // 3) Query paginada (limit+1)
    // ==========================
    // Tip: usamos limit+1 para saber si hay más páginas sin un COUNT caro.
    const rows = await getWatchEventsPage(db, {
      token,
      since,
      until,
      limit, // el DAO debe aplicar limit+1 internamente o nosotros pedimos limit+1
      order,
      afterTs: cursorData?.ts, // desde el cursor (exclusive)
      afterId: cursorData?.id, // desde el cursor (exclusive)
    });

    // Detectar hasMore y recortar a 'limit'
    let hasMore = false;
    let page = rows;
    if (rows.length > limit) {
      hasMore = true;
      page = rows.slice(0, limit);
    }

    // Map de filas -> payload externo
    const events = page.map((r) => ({
      tipoEvento: r.event_type,
      archivo: r.file_path,
      tiempo: r.ts,
    }));

    // Cursor siguiente si hay más páginas
    const nextCursor =
      hasMore && page.length > 0
        ? encodeCursor(page[page.length - 1].ts, page[page.length - 1].id)
        : null;

    // Base de respuesta
    const baseResponse = {
      events,
      meta: {
        returned: events.length,
        hasMore,
        nextCursor,
        order,
        window: { since, until },
        limitApplied: limit,
      },
    };

    // =========================================
    // 4) Guardrail de tamaño de respuesta
    // =========================================
    const asJson = JSON.stringify(baseResponse);
    const payloadSize = Buffer.byteLength(asJson, "utf8");

    if (payloadSize > PROTOCOL.LIMITS.MAX_PAYLOAD_BYTES) {
      // Truncamos proporcionalmente para respetar el límite
      const ratio = PROTOCOL.LIMITS.MAX_PAYLOAD_BYTES / payloadSize;
      const safeCount = Math.max(1, Math.floor(events.length * ratio));
      const truncated = events.slice(0, safeCount);

      logger.warn(
        `[getwatches] Payload ${payloadSize}B > ${PROTOCOL.LIMITS.MAX_PAYLOAD_BYTES}B. ` +
          `Truncado ${safeCount}/${events.length}.`
      );

      return {
        events: truncated,
        meta: {
          ...baseResponse.meta,
          returned: truncated.length,
          truncated: true,
          warning: `Respuesta truncada a ${truncated.length}/${events.length} eventos por límite de tamaño`,
        },
      };
    }

    // OK
    return baseResponse;
  },
};