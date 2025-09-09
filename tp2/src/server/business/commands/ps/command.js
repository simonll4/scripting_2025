import si from "systeminformation";
import { SCOPES } from "../../../security/index.js";
import { PROTOCOL } from "../../../../protocol/index.js";
import schema, {
  MAX_PROCESSES_LIMIT,
  VALID_SORT_FIELDS,
  PROJECTION_FIELDS,
} from "./schema.js";

/**
 * Proyecta los campos solicitados de un proceso del `systeminformation`
 * hacia el contrato de salida de nuestro comando.
 */
function projectFields(proc, fields) {
  // Map consolidado desde systeminformation -> contrato de salida
  const base = {
    pid: proc.pid,
    ppid: proc.parentPid ?? proc.ppid,
    user: proc.user,
    name: proc.name,
    cmd: proc.command,
    state: proc.state, // R/S/D, etc.
    cpuPercent: proc.pcpu,
    memRssBytes: proc.mem_rss,
    memVszBytes: proc.mem_vsz,
    priority: proc.priority,
    nice: proc.nice,
    startedAt: proc.started, // epoch ms si disponible
  };

  // Si no pidieron campos específicos, devolvemos todo lo soportado
  if (!fields || fields.length === 0) return base;

  // Aseguramos que solo salgan campos válidos (por PROJECTION_FIELDS)
  const safeFields = fields.filter((f) => PROJECTION_FIELDS.includes(f));
  return Object.fromEntries(safeFields.map((f) => [f, base[f]]));
}

/**
 * Construye el comparador en función del sortBy válido.
 */
function getComparator(sortBy) {
  const comparators = {
    cpu: (a, b) => (a.pcpu || 0) - (b.pcpu || 0),
    mem: (a, b) => (a.mem_rss || 0) - (b.mem_rss || 0),
    pid: (a, b) => (a.pid || 0) - (b.pid || 0),
    name: (a, b) => String(a.name || "").localeCompare(String(b.name || "")),
  };
  return comparators[sortBy] ?? comparators.cpu;
}

/**
 * Aplica filtros opcionales por usuario y por patrón (regex) de nombre/cmd.
 */
function applyFilters(list, { user, namePattern }) {
  let filtered = list;

  if (user) {
    filtered = filtered.filter((p) => (p.user || "") === user);
  }

  if (namePattern) {
    let re;
    try {
      re = new RegExp(namePattern, "i");
    } catch {
      throw new Error(`Invalid namePattern regex: ${namePattern}`);
    }
    filtered = filtered.filter(
      (p) => re.test(p.name || "") || re.test(p.command || "")
    );
  }

  return filtered;
}

/**
 * Si el payload excede el límite del protocolo, trunca y anota en meta.
 */
function enforcePayloadLimit(result) {
  const bytes = Buffer.byteLength(JSON.stringify(result), "utf8");
  if (bytes <= PROTOCOL.LIMITS.MAX_PAYLOAD_BYTES) return result;

  const truncated = Math.max(0, Math.floor(result.processes.length * 0.7)); // -30%
  return {
    ...result,
    processes: result.processes.slice(0, truncated),
    meta: {
      ...result.meta,
      returned: truncated,
      truncated: true,
      warning: "Response truncated due to size limits",
    },
  };
}

export default {
  scope: SCOPES.PS,
  closeAfter: false,
  // Nota: se asume que el payload ya fue validado contra `schema` en la pipeline
  handler: async ({ data }) => {
    const {
      limit = schema.properties.limit.default,
      sortBy = schema.properties.sortBy.default,
      order = schema.properties.order.default,
      user,
      namePattern,
      fields,
    } = data || {};

    // Defensa adicional por si se llama sin validar (no debería)
    if (typeof limit !== "number" || limit < 1 || limit > MAX_PROCESSES_LIMIT) {
      throw new Error(
        `Invalid limit: must be between 1 and ${MAX_PROCESSES_LIMIT}`
      );
    }

    const snapshot = await si.processes(); // { list, all, running, blocked, sleeping, ... }
    const list = snapshot.list || [];

    // 1) Filtros
    const filtered = applyFilters(list, { user, namePattern });
    const total = filtered.length;

    // 2) Orden (asegurar sortBy válido por si llegó sin validar)
    const safeSortBy = VALID_SORT_FIELDS.includes(sortBy) ? sortBy : "cpu";
    const comparator = getComparator(safeSortBy);
    const ordered = [...filtered].sort(comparator);
    if (order === "desc") ordered.reverse();

    // 3) Limit + proyección
    const processes = ordered
      .slice(0, limit)
      .map((p) => projectFields(p, fields));

    // 4) Meta y payload
    const result = {
      processes,
      meta: {
        total, // tras filtros
        returned: processes.length,
        sortBy: safeSortBy,
        order,
        limit,
        summary: {
          all: snapshot.all ?? list.length,
          running: snapshot.running ?? 0,
          blocked: snapshot.blocked ?? 0,
          sleeping: snapshot.sleeping ?? 0,
        },
      },
    };

    // 5) Límite de payload
    return enforcePayloadLimit(result);
  },
};