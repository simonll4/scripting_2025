import path from "node:path";
import { SCOPES } from "../../../security/index.js";
import { startNewWatch } from "../../services/watchRuntime.js";

// BaseDir del usuario (igual que en oscmd)
const BASE_DIR = "/home/simonll4";
const ALLOWED_ROOTS = ["/home/simonll4"];

/** Normaliza y valida que la ruta caiga dentro de BASE_DIR/ALLOWED_ROOTS */
function resolveSafePath(rawPath) {
  const absCandidate = path.isAbsolute(rawPath)
    ? path.normalize(rawPath)
    : path.resolve(BASE_DIR, rawPath);

  // Chequeo prefijo (para evitar escapes con ../)
  const withSep = (p) => (p.endsWith(path.sep) ? p : p + path.sep);
  const isInside = ALLOWED_ROOTS.some((root) =>
    withSep(absCandidate).startsWith(withSep(path.normalize(root)))
  );

  if (!isInside) {
    throw new Error(`Ruta fuera de la base permitida: ${rawPath}`);
  }
  return absCandidate;
}

export default {
  scope: SCOPES.WATCH,
  closeAfter: false,

  async handler({ db, data }) {
    const { path: rawPath, time = 60 } = data || {};

    if (!rawPath || typeof rawPath !== "string") {
      throw new Error("Parámetro 'path' inválido o faltante");
    }

    // Resolver la ruta con la misma política que oscmd
    const safePath = resolveSafePath(rawPath);

    // Iniciar el watch sobre la ruta ya saneada
    return await startNewWatch(db, safePath, time);
  },
};

// import { SCOPES } from "../../../security/index.js";
// import { startNewWatch } from "../../services/watchRuntime.js";

// export default {
//   scope: SCOPES.WATCH,
//   closeAfter: false,
//   async handler({ db, data }) {
//     const { path, time = 60 } = data || {};
//     return await startNewWatch(db, path, time);
//   },
// };
