import { SERVER_COMMANDS } from "../../../server/business/commands/constants.js";

export const quit = {
  name: "quit",
  desc: "Desconectar y salir",
  usage: "quit",
  local: false,
  action: SERVER_COMMANDS.QUIT,
  build: () => {
    return {};
  },
};
