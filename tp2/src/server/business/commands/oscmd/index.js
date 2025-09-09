import { SERVER_COMMANDS } from "../constants.js";
import command from "./command.js";
import schema from "./schema.js";

// Act identifica el comando en tu bus/protocolo de servidor
export const act = SERVER_COMMANDS.OS_CMD;

// Exporta la implementación y el esquema para el pipeline (AJV, etc.)
export { command, schema };
