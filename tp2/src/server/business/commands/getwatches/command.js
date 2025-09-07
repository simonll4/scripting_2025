import { SCOPES } from "../../../utils/index.js";

export default {
  scope: SCOPES.GET_WATCHES,
  closeAfter: false,
  handler: async ({ db, session, data }) => {
    const { token, since, until, limit = 1000 } = data || {};

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

    return { events };
  },
};
