import { SERVER_COMMANDS } from "../../../../server/business/commands/constants.js";

export const watch = {
  name: "watch",
  desc: "Iniciar monitoreo de un directorio o archivo",
  usage: "watch <path> [tiempo=60]",
  local: false,
  action: SERVER_COMMANDS.WATCH,
  build: ([path, time = "60"]) => {
    if (!path || !path.trim()) {
      throw new Error("Debe especificar la ruta a monitorear. Ejemplo: watch /home/user/docs");
    }

    // Validar que la ruta parece válida (básicamente)
    const cleanPath = path.trim();
    if (cleanPath.length < 2) {
      throw new Error("La ruta especificada parece demasiado corta");
    }

    const timeNum = Number(time);
    if (!Number.isFinite(timeNum) || timeNum < 1 || timeNum > 3600) {
      throw new Error("El tiempo debe ser un número entre 1 y 3600 segundos. Ejemplo: watch /tmp 120");
    }
    
    return { 
      path: cleanPath,
      time: timeNum 
    };
  },
};
