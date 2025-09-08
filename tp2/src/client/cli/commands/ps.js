import { SERVER_COMMANDS } from "../../../server/business/commands/constants.js";

export const ps = {
  name: "ps",
  desc: "Listar procesos del sistema remoto",
  usage: "ps [--limit <n>] [--sort <field>] [--order <asc|desc>] [--user <username>] [--pattern <regex>]",
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
          if (!isNaN(limit) && limit > 0 && limit <= 500) {
            data.limit = limit;
          }
          break;
        case '--sort':
          const sortBy = args[++i];
          if (['cpu', 'mem', 'pid', 'name'].includes(sortBy)) {
            data.sortBy = sortBy;
          }
          break;
        case '--order':
          const order = args[++i];
          if (['asc', 'desc'].includes(order)) {
            data.order = order;
          }
          break;
        case '--user':
          data.user = args[++i];
          break;
        case '--pattern':
          data.namePattern = args[++i];
          break;
      }
    }
    
    return data;
  },
};
