import { SCOPES } from "../../../security/index.js";
import { getLastSeconds, getAllSamples } from "../../services/sampler.js";

export default {
  scope: SCOPES.GET_OS_INFO,
  closeAfter: false,

  handler: async ({ data }) => {
    let raw;

    // Si viene seconds numérico → ventana
    if (typeof data?.seconds === "number") {
      const clamped = Math.min(Math.max(data.seconds, 1), 3600);
      raw = await getLastSeconds(clamped);
    } else {
      // Sin seconds → todas las muestras disponibles (según retención del sampler/DB)
      raw = await getAllSamples();
    }

    // Mapeo de respuesta
    const samples = raw.map((s) => ({
      cpu: s.cpu,
      memUsed: s.memUsed,
      memUsedPercent: s.memUsedPercent,
      time: s.time,
    }));

    return { samples };
  },
};
