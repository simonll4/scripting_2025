import { SERVER_COMMANDS } from "../../../server/business/commands/constants.js";

export const oscmd = {
  name: "oscmd",
  desc: "Ejecutar comando del sistema operativo remoto",
  usage: "oscmd <comando> [argumentos...]",
  local: false,
  action: SERVER_COMMANDS.OS_CMD,
  build: (args) => {
    if (!args || args.length === 0) {
      throw new Error("Debe especificar un comando para ejecutar");
    }
    
    const [command, ...cmdArgs] = args;
    
    if (!command.trim()) {
      throw new Error("El comando no puede estar vacío");
    }
    
    return { 
      command: command.trim(),
      args: cmdArgs.map(arg => arg.trim()).filter(arg => arg.length > 0)
    };
  },
};
