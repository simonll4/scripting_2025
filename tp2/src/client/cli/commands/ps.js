import { SERVER_COMMANDS } from "../../../server/business/commands/constants.js";

export const ps = {
  name: "ps",
  desc: "Listar procesos del sistema remoto",
  usage: "ps",
  local: false,
  action: SERVER_COMMANDS.PS,
  build: () => {
    return {};
  },
};
