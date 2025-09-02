import { SCOPES } from "../../../utils/index.js";

export default {
  scope: SCOPES.WATCH,
  closeAfter: false,
  // handler signature uniforme
  handler: async ({ db, session, data, socket, connection }) => {
    // TODO: implementar lógica de WATCH
    // Devolvemos un placeholder estructurado para probar el flujo end-to-end
    return {
      message: "WATCH not implemented yet",
      received: data ?? null,
    };
  },
};
