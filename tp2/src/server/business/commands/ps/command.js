import si from "systeminformation";
import { SCOPES } from "../../../security/index.js";
import { PROTOCOL } from "../../../../protocol/index.js";

// Maximum number of processes that can be returned (prevent DoS)
// NOTE: This value MUST match the "maximum" in ps/schema.js to maintain consistency
const MAX_PROCESSES_LIMIT = 1000;
const DEFAULT_LIMIT = 100;

function projectFields(proc, fields) {
  const base = {
    pid: proc.pid,
    ppid: proc.parentPid || proc.ppid,
    user: proc.user,
    name: proc.name,
    cmd: proc.command,
    state: proc.state, // e.g. R/S/D
    cpuPercent: proc.pcpu, // % CPU usado por proceso
    memRssBytes: proc.mem_rss, // RSS en bytes
    memVszBytes: proc.mem_vsz, // VSZ en bytes
    priority: proc.priority,
    nice: proc.nice,
    startedAt: proc.started, // epoch ms si disponible
  };

  if (!fields || fields.length === 0) return base;
  const picked = {};
  for (const f of fields) {
    if (base.hasOwnProperty(f)) {
      picked[f] = base[f];
    }
  }
  return picked;
}

export default {
  scope: SCOPES.PS,
  closeAfter: false,
  handler: async ({ data }) => {
    const {
      limit = DEFAULT_LIMIT,
      sortBy = "cpu",
      order = "desc",
      user,
      namePattern,
      fields,
    } = data || {};

    // Validate limit parameter to prevent DoS
    if (typeof limit !== "number" || limit < 1 || limit > MAX_PROCESSES_LIMIT) {
      throw new Error(
        `Invalid limit: must be between 1 and ${MAX_PROCESSES_LIMIT}`
      );
    }

    // 1) Snapshot de procesos del sistema
    const procs = await si.processes(); // { list: [...], ... }
    let list = procs.list || [];

    // 2) Filtros
    if (user) {
      list = list.filter((p) => (p.user || "") === user);
    }
    if (namePattern) {
      let re;
      try {
        re = new RegExp(namePattern, "i");
      } catch {
        throw new Error(`Invalid namePattern regex: ${namePattern}`);
      }
      list = list.filter(
        (p) => re.test(p.name || "") || re.test(p.command || "")
      );
    }

    const total = list.length;

    // 3) Ordenamiento
    const validSortFields = ["cpu", "mem", "pid", "name"];
    const actualSortBy = validSortFields.includes(sortBy) ? sortBy : "cpu";

    const comparators = {
      cpu: (a, b) => (a.pcpu || 0) - (b.pcpu || 0),
      mem: (a, b) => (a.mem_rss || 0) - (b.mem_rss || 0),
      pid: (a, b) => (a.pid || 0) - (b.pid || 0),
      name: (a, b) => String(a.name || "").localeCompare(String(b.name || "")),
    };

    const cmp = comparators[actualSortBy];
    list.sort(cmp);
    if (order === "desc") list.reverse();

    // 4) Limit + proyección de campos
    const limited = list.slice(0, limit).map((p) => projectFields(p, fields));

    // 5) Check payload size and truncate if necessary
    const result = {
      processes: limited,
      meta: {
        total, // total tras filtros (antes de limit)
        returned: limited.length,
        sortBy: actualSortBy,
        order,
        limit,
        summary: {
          all: procs.all || procs.list?.length || 0,
          running: procs.running || 0,
          blocked: procs.blocked || 0,
          sleeping: procs.sleeping || 0,
        },
      },
    };

    // Check if response would exceed MAX_PAYLOAD_BYTES
    const resultJson = JSON.stringify(result);
    if (
      Buffer.byteLength(resultJson, "utf8") > PROTOCOL.LIMITS.MAX_PAYLOAD_BYTES
    ) {
      // Truncate the process list and add warning
      const truncatedLimit = Math.floor(limited.length * 0.7); // Reduce by 30%
      result.processes = limited.slice(0, truncatedLimit);
      result.meta.returned = truncatedLimit;
      result.meta.truncated = true;
      result.meta.warning = "Response truncated due to size limits";
    }

    return result;
  },
};
