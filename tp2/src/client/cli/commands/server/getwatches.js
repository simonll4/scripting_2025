import { SERVER_COMMANDS } from "../../../../server/business/commands/constants.js";

export const getwatches = {
  name: "getwatches",
  desc: "Obtener eventos del monitoreo activo",
  usage: "getwatches <token> [opciones]",
  local: false,
  action: SERVER_COMMANDS.GET_WATCHES,
  build: (args) => {
    if (!args || args.length === 0) {
      throw new Error("Debe especificar el token de seguimiento");
    }

    const data = {
      token: args[0].trim()
    };

    // Parsear argumentos opcionales
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];
      switch (arg) {
        case '--since':
          const since = parseInt(args[++i], 10);
          if (!isNaN(since) && since > 0) {
            data.since = since;
          } else {
            throw new Error("--since debe ser un timestamp válido en milisegundos");
          }
          break;
        case '--until':
          const until = parseInt(args[++i], 10);
          if (!isNaN(until) && until > 0) {
            data.until = until;
          } else {
            throw new Error("--until debe ser un timestamp válido en milisegundos");
          }
          break;
        case '--page-size':
          const pageSize = parseInt(args[++i], 10);
          if (!isNaN(pageSize) && pageSize >= 1 && pageSize <= 20000) {
            data.pageSize = pageSize;
          } else {
            throw new Error("--page-size debe estar entre 1 y 20000");
          }
          break;
        case '--order':
          const order = args[++i];
          if (order === 'asc' || order === 'desc') {
            data.order = order;
          } else {
            throw new Error("--order debe ser 'asc' o 'desc'");
          }
          break;
        case '--cursor':
          data.cursor = args[++i];
          break;
      }
    }
    
    return data;
  },
};
