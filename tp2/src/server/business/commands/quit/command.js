export default {
  scope: null,
  closeAfter: true,
  // handler signature uniforme
  handler: async ({ db, session, data, socket, connection }) => {
    return { bye: true };
  }
};
