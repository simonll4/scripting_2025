import { SERVER_COMMANDS } from "../../../server/business/commands/constants.js";

export const watch = {
  name: "watch",
  desc: "Iniciar monitoreo de un directorio o archivo",
  usage: "watch <path> [tiempo=60]",
  local: false,
  action: SERVER_COMMANDS.WATCH,
  build: ([path, time = "60"]) => {
    if (!path) {
      throw new Error("Debe especificar un path para monitorear");
    }
    
    const timeNum = Number(time);
    if (!Number.isFinite(timeNum) || timeNum < 1 || timeNum > 3600) {
      throw new Error("El tiempo debe ser un número entre 1 y 3600 segundos");
    }
    
    return { 
      path: path.trim(),
      time: timeNum 
    };
  },
};
