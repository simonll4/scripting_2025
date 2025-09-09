import { getosinfo } from "./server/getosinfo.js";
import { help } from "./local/help.js";
import { quit } from "./server/quit.js";
import { watch } from "./server/watch.js";
import { getwatches } from "./server/getwatches.js";
import { ps } from "./server/ps.js";
import { oscmd } from "./server/oscmd.js";
import { status } from "./local/status.js";
import { clear } from "./local/clear.js";

export const COMMANDS = {
  [help.name]: help,
  [clear.name]: clear,
  [status.name]: status,
  [quit.name]: quit,
  [getosinfo.name]: getosinfo,
  [watch.name]: watch,
  [getwatches.name]: getwatches,
  [ps.name]: ps,
  [oscmd.name]: oscmd,
};
