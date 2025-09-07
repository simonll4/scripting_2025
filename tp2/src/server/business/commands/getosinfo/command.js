import { SCOPES } from "../../../utils/index.js";
import { getLastSeconds } from "../../services/sampler.js";

export default {
  scope: SCOPES.GET_OS_INFO,
  closeAfter: false,
  handler: async ({ data }) => {
    const seconds = Number(data?.seconds ?? 60);
    const clamped = Math.min(Math.max(seconds, 1), 3600);

    const raw = getLastSeconds(clamped);

    // Mapeo de respuesta:
    // - cpu: % de uso de CPU
    // - memUsed: bytes usados (total - available)
    // - memUsedPercent: % usado
    const samples = raw.map((s) => ({
      cpu: s.cpu,
      memUsed: s.memUsed,
      memUsedPercent: s.memUsedPercent,
      time: s.time,
    }));

    return { samples };
  },
};
