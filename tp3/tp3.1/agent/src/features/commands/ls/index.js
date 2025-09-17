import schema from "./schema.js";
import { handleLs } from "./command.js";
import { COMMANDS } from "../constants.js";

export default {
  name: COMMANDS.LS,
  description: "Lista archivos/carpetas dentro del root del agente",
  argsSchema: schema,
  handler: handleLs,
};
    