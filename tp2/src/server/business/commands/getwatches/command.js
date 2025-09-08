import { SCOPES } from "../../../security/index.js";
import { PROTOCOL } from "../../../../protocol/index.js";
import { logger } from "../../../utils/logger.js";

export default {
  scope: SCOPES.GET_WATCHES,
  closeAfter: false,
  handler: async ({ db, session, data }) => {
    const { token, since, until, limit: rawLimit = 1000 } = data || {};

    //  limit entre 1 y 10000
    const limit = Math.max(1, Math.min(rawLimit, 10000));

    // 1) Confirmar que el token de watch existe
    const meta = await db.get("SELECT token FROM watches WHERE token = ?", [
      token,
    ]);
    if (!meta) {
      return {
        error: "UNKNOWN_TOKEN",
        message: `No existe watch con token=${token}`,
      };
    }

    // 2) Build query dinámico según filtros
    const where = ["token = ?"];
    const params = [token];

    if (typeof since === "number") {
      where.push("ts >= ?");
      params.push(since);
    }
    if (typeof until === "number") {
      where.push("ts <= ?");
      params.push(until);
    }

    const sql = `
      SELECT event_type, file_path, ts
      FROM watch_events
      WHERE ${where.join(" AND ")}
      ORDER BY ts ASC
      LIMIT ?
    `;
    params.push(limit);

    const rows = await db.all(sql, params);

    // 3) Mapear a shape requerido
    const events = rows.map((r) => ({
      tipoEvento: r.event_type,
      archivo: r.file_path,
      tiempo: r.ts,
    }));

    // 4) Validar tamaño de respuesta contra MAX_PAYLOAD_BYTES
    const responsePayload = { events };
    const payloadSize = Buffer.byteLength(
      JSON.stringify(responsePayload),
      "utf8"
    );

    if (payloadSize > PROTOCOL.LIMITS.MAX_PAYLOAD_BYTES) {
      // Truncar events y agregar warning
      const maxEvents = Math.max(
        1,
        Math.floor(
          (events.length * PROTOCOL.LIMITS.MAX_PAYLOAD_BYTES) / payloadSize
        )
      );
      const truncatedEvents = events.slice(0, maxEvents);

      logger.warn(
        `[getwatches] Response payload truncated: ${payloadSize} bytes > ${PROTOCOL.LIMITS.MAX_PAYLOAD_BYTES} bytes. Showing ${truncatedEvents.length}/${events.length} events.`
      );

      return {
        events: truncatedEvents,
        meta: {
          returned: truncatedEvents.length,
          total: events.length,
          truncated: true,
          warning: `Response truncated: showing ${truncatedEvents.length}/${events.length} events due to size limits`,
        },
      };
    }

    return responsePayload;
  },
};
