import { SERVER_COMMANDS } from "../../../../server/business/commands/constants.js";

export const ps = {
  name: "ps",
  desc: "Listar procesos del sistema remoto",
  usage: "ps [opciones]",
  local: false,
  action: SERVER_COMMANDS.PS,
  build: (args) => {
    const data = {};
    
    // Parse command line arguments
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      switch (arg) {
        case '--limit':
          const limit = parseInt(args[++i], 10);
          if (!isNaN(limit) && limit > 0 && limit <= 1000) {
            data.limit = limit;
          } else {
            throw new Error("--limit debe estar entre 1 y 1000");
          }
          break;
        case '--sort':
          const sortBy = args[++i];
          if (['cpu', 'mem', 'pid', 'name'].includes(sortBy)) {
            data.sortBy = sortBy;
          } else {
            throw new Error("--sort debe ser uno de: cpu, mem, pid, name");
          }
          break;
        case '--order':
          const order = args[++i];
          if (['asc', 'desc'].includes(order)) {
            data.order = order;
          } else {
            throw new Error("--order debe ser 'asc' o 'desc'");
          }
          break;
        case '--user':
          const user = args[++i];
          if (user && user.trim()) {
            data.user = user.trim();
          } else {
            throw new Error("--user requiere un nombre de usuario válido");
          }
          break;
        case '--pattern':
          const pattern = args[++i];
          if (pattern && pattern.trim()) {
            data.namePattern = pattern.trim();
          } else {
            throw new Error("--pattern requiere una expresión regular válida");
          }
          break;
        case '--fields':
          const fields = args[++i];
          if (fields && fields.trim()) {
            const validFields = ['pid', 'ppid', 'user', 'name', 'cmd', 'state', 'cpuPercent', 'memRssBytes', 'memVszBytes', 'priority', 'nice', 'startedAt'];
            const requestedFields = fields.split(',').map(f => f.trim()).filter(f => f);
            const invalidFields = requestedFields.filter(f => !validFields.includes(f));
            
            if (invalidFields.length > 0) {
              throw new Error(`Campos inválidos: ${invalidFields.join(', ')}. Campos válidos: ${validFields.join(', ')}`);
            }
            
            data.fields = requestedFields;
          } else {
            throw new Error("--fields requiere una lista de campos separados por comas");
          }
          break;
      }
    }
    
    return data;
  },
};
