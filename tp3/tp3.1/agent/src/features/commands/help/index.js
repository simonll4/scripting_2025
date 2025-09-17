import schema from "./schema.js";
import { handleHelp } from "./command.js";
import { COMMANDS } from "../constants.js";

export default {
  name: COMMANDS.HELP,
  description: "Lista los comandos disponibles",
  argsSchema: schema,
  handler: handleHelp,
};
