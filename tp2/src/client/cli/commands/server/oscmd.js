import { SERVER_COMMANDS } from "../../../../server/business/commands/constants.js";

export const oscmd = {
  name: "oscmd",
  desc: "Ejecutar comando del sistema operativo remoto",
  usage: "oscmd <comando> [argumentos...] [--timeout <ms>]",
  local: false,
  action: SERVER_COMMANDS.OS_CMD,
  build: (args) => {
    if (!args || args.length === 0) {
      throw new Error("Debe especificar un comando para ejecutar");
    }

    const data = {};
    const cmdArgs = [];
    
    // Parse arguments, looking for --timeout flag
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--timeout') {
        const timeout = parseInt(args[++i], 10);
        if (!isNaN(timeout) && timeout >= 1000 && timeout <= 60000) {
          data.timeoutMs = timeout;
        } else {
          throw new Error("Timeout debe estar entre 1000 y 60000 ms");
        }
      } else if (i === 0) {
        // First non-flag argument is the command
        if (!arg.trim()) {
          throw new Error("El comando no puede estar vacío");
        }
        data.cmd = arg.trim();
      } else {
        // Subsequent non-flag arguments are command arguments
        cmdArgs.push(arg.trim());
      }
    }

    if (!data.cmd) {
      throw new Error("Debe especificar un comando para ejecutar");
    }

    data.args = cmdArgs.filter((arg) => arg.length > 0);
    
    return data;
  },
};
