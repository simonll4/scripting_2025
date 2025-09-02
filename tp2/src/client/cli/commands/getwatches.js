import { SERVER_COMMANDS } from "../../../server/business/commands/constants.js";

export const getwatches = {
  name: "getwatches",
  desc: "Obtener eventos del monitoreo activo",
  usage: "getwatches <token>",
  local: false,
  action: SERVER_COMMANDS.GET_WATCHES,
  build: ([token]) => {
    if (!token) {
      throw new Error("Debe especificar el token de seguimiento");
    }
    
    return { 
      token: token.trim()
    };
  },
};
