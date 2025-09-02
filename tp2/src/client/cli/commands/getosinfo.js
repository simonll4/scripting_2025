import { SERVER_COMMANDS } from "../../../server/business/commands/constants.js";

export const getosinfo = {
  name: "getosinfo",
  desc: "Obtener información del sistema operativo",
  usage: "getosinfo [segundos=60]",
  local: false,
  action: SERVER_COMMANDS.GET_OS_INFO,
  build: ([seconds = "60"]) => {
    const n = Number(seconds);
    if (!Number.isFinite(n) || n < 1 || n > 3600) {
      throw new Error("Los segundos deben ser un número entre 1 y 3600");
    }
    return { seconds: n };
  },
};
