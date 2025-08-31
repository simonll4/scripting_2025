import { PROTOCOL } from "../../../utils/index.js";
import command from "./command.js";
import schema from "./schema.js";

export const act = PROTOCOL.CORE_ACTS.GET_OS_INFO;
export { command, schema };
