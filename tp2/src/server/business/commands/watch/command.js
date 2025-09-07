import { SCOPES } from "../../../utils/index.js";
import { startNewWatch } from "../../services/watchRuntime.js";

export default {
  scope: SCOPES.WATCH,
  closeAfter: false,
  async handler({ db, session, data }) {
    const { path, time = 60 } = data || {};
    return await startNewWatch(db, path, time);
  },
};
