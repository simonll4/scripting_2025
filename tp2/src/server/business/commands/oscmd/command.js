import { SCOPES } from "../../../utils/index.js";

export default {
  scope: SCOPES.OS_CMD,
  closeAfter: false,
  handler: async ({ db, session, data }) => {
    // TODO: implementar lógica de OS_CMD
    // IMPORTANTE: será clave la seguridad (whitelist de comandos, sandboxing, etc.)
    return {
      message: "OS_CMD not implemented yet",
      received: data ?? null,
    };
  },
};
