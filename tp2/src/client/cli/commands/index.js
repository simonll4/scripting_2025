import { getosinfo } from "./getosinfo.js";
import { help } from "./help.js";
import { quit } from "./quit.js";
import { watch } from "./watch.js";
import { getwatches } from "./getwatches.js";
import { ps } from "./ps.js";
import { oscmd } from "./oscmd.js";

export const COMMANDS = {
  [help.name]: help,
  [quit.name]: quit,
  [getosinfo.name]: getosinfo,
  [watch.name]: watch,
  [getwatches.name]: getwatches,
  [ps.name]: ps,
  [oscmd.name]: oscmd,
};
