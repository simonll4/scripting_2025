import { SCOPES } from "../../../utils/index.js";

export default {
  scope: SCOPES.GET_WATCHES,
  closeAfter: false,
  handler: async ({ db, session, data }) => {
    // TODO: implementar lógica de GET_WATCHES
    return {
      message: "GET_WATCHES not implemented yet",
      received: data ?? null,
    };
  },
};
