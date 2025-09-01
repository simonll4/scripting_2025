import { SCOPES } from "../../../utils/index.js";

export default {
  scope: SCOPES.GET_OS_INFO,
  closeAfter: false,
  // handler signature uniforme
  handler: async ({ db, session, data, socket, connection }) => {
    const seconds = Number(data?.seconds ?? 60);
    // Aquí iría tu lógica real de obtener información del OS
    return { 
      uptimeSeconds: seconds, 
      os: process.platform,
      samples: [{ cpu: 0.12, mem: 2048, time: Date.now() }]
    };
  }
};
