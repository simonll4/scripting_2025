import si from "systeminformation";
import { SCOPES } from "../../../utils/index.js";

export default {
  scope: SCOPES.PS,
  closeAfter: false,
  handler: async () => {
    // 1) Tomar snapshot de procesos
    const procs = await si.processes();

    // 2) Mapear a campos básicos
    const list = (procs.list || []).map((p) => ({
      pid: p.pid,
      ppid: p.parentPid,
      user: p.user,
      name: p.name,
      cpuPercent: p.pcpu, // % CPU usado por proceso
      memRssBytes: p.mem_rss, // memoria residente en bytes
    }));

    // 3) Responder con meta básica
    return {
      processes: list,
      meta: {
        total: list.length,
        running: procs.running,
        blocked: procs.blocked,
        sleeping: procs.sleeping,
      },
    };
  },
};

// import si from "systeminformation";
// import { SCOPES } from "../../../utils/index.js";

// function projectFields(proc, fields) {
//   const base = {
//     pid: proc.pid,
//     ppid: proc.parentPid,
//     user: proc.user,
//     name: proc.name,
//     cmd: proc.command,
//     state: proc.state, // e.g. R/S/D
//     cpuPercent: proc.pcpu, // % CPU usado por proceso
//     memRssBytes: proc.mem_rss, // RSS en bytes
//     memVszBytes: proc.mem_vsz, // VSZ en bytes
//     priority: proc.priority,
//     nice: proc.nice,
//     startedAt: proc.started, // epoch ms si disponible
//   };

//   if (!fields || fields.length === 0) return base;
//   const picked = {};
//   for (const f of fields) picked[f] = base[f];
//   return picked;
// }

// export default {
//   scope: SCOPES.PS,
//   closeAfter: false,
//   handler: async ({ data }) => {
//     const {
//       limit = 100,
//       sortBy = "cpu",
//       order = "desc",
//       user,
//       namePattern,
//       fields,
//     } = data || {};

//     // 1) Snapshot de procesos del sistema
//     const procs = await si.processes(); // { list: [...], ... }
//     let list = procs.list || [];

//     // 2) Filtros
//     if (user) {
//       list = list.filter((p) => (p.user || "") === user);
//     }
//     if (namePattern) {
//       let re;
//       try {
//         re = new RegExp(namePattern, "i");
//       } catch {
//         // Si el regex no compila, lo ignoramos (o podrías lanzar 400)
//       }
//       if (re) {
//         list = list.filter(
//           (p) => re.test(p.name || "") || re.test(p.command || "")
//         );
//       }
//     }

//     const total = list.length;

//     // 3) Ordenamiento
//     const comparators = {
//       cpu: (a, b) => (a.pcpu || 0) - (b.pcpu || 0),
//       mem: (a, b) => (a.mem_rss || 0) - (b.mem_rss || 0),
//       pid: (a, b) => (a.pid || 0) - (b.pid || 0),
//       name: (a, b) => String(a.name || "").localeCompare(String(b.name || "")),
//     };
//     const cmp = comparators[sortBy] || comparators.cpu;
//     list.sort(cmp);
//     if (order === "desc") list.reverse();

//     // 4) Limit + proyección de campos
//     const limited = list.slice(0, limit).map((p) => projectFields(p, fields));

//     // 5) Meta útil
//     const meta = {
//       total, // total tras filtros (antes de limit)
//       returned: limited.length,
//       sortBy,
//       order,
//       limit,
//       summary: {
//         all: procs.all, // contadores del snapshot si los provee si
//         running: procs.running,
//         blocked: procs.blocked,
//         sleeping: procs.sleeping,
//       },
//     };

//     return { processes: limited, meta };
//   },
// };

// // import { SCOPES } from "../../../utils/index.js";

// // export default {
// //   scope: SCOPES.PS,
// //   closeAfter: false,
// //   handler: async ({ db, session, data }) => {
// //     // TODO: implementar lógica de PS
// //     return {
// //       message: "PS not implemented yet",
// //       received: data ?? null,
// //     };
// //   },
// // };
