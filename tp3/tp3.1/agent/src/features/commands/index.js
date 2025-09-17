import Ajv from "ajv";
import Help from "./help/index.js";
import Ls from "./ls/index.js";
// Cuando sumes más comandos, importalos acá y agrégalos al array REGISTERED

const REGISTERED = [Help, Ls];

const ajv = new Ajv({ allErrors: true });

// Schema base del REQUEST (solo para validar id/args/replyTo)
const baseRequestSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    args: { type: "object" },
    replyTo: { type: ["string", "null"] },
  },
  required: ["id"],
  additionalProperties: true,
};
const validateBase = ajv.compile(baseRequestSchema);

// Compilar schemas de args por comando (si existen)
const registry = new Map();
for (const def of REGISTERED) {
  const compiled = def.argsSchema ? ajv.compile(def.argsSchema) : null;
  registry.set(def.name, { ...def, validateArgs: compiled });
}

// === API pública del módulo ===
export function validateBaseRequest(obj) {
  const ok = validateBase(obj);
  return { ok, errors: validateBase.errors || null };
}

export function listCommands() {
  return Array.from(registry.values()).map(({ name, description }) => ({
    name,
    description,
  }));
}

export async function routeAndExecute(command, args = {}) {
  const def = registry.get(command);
  if (!def) {
    return {
      code: "UNKNOWN_COMMAND",
      message: "Unknown command",
      result: false,
    };
  }
  // Validar args específicos si hay schema
  if (def.validateArgs && !def.validateArgs(args)) {
    return {
      code: "BAD_ARGS",
      message: "Invalid args",
      errors: def.validateArgs.errors,
      result: false,
    };
  }
  return def.handler(args);
}

// import fs from "node:fs/promises";
// import path from "node:path";
// import { loadAgentConfig } from "../../config/index.js";
// import { logger } from "../../utils/logger.js";

// // Load config once for better performance
// const agentConfig = loadAgentConfig();

// // Constants for command responses
// const HELP_COMMANDS = [
//   { command: "help", description: "Lista de comandos disponibles" },
//   { command: "ls", description: "Lista archivos y carpetas: ls /algun/path" },
// ];

// export function helpCommand(agentName) {
//   return {
//     message: "OK",
//     result: HELP_COMMANDS,
//   };
// }

// export async function lsCommand(requestedPath) {
//   try {
//     // Security: resolve against root_dir and prevent path traversal
//     const rootDir = agentConfig.agent.root_dir || ".";
//     const rootAbsolute = path.resolve(rootDir);

//     let targetPath;
//     let resolvedPath;

//     if (!requestedPath || requestedPath.trim() === "") {
//       // Si no se especifica path, usar el directorio base
//       targetPath = ".";
//       resolvedPath = rootAbsolute;
//     } else {
//       const cleanPath = requestedPath.trim();

//       // Si es un path absoluto, verificar que esté dentro del root
//       if (path.isAbsolute(cleanPath)) {
//         resolvedPath = path.resolve(cleanPath);
//         // Verificar que el path absoluto esté dentro del root
//         if (!resolvedPath.startsWith(rootAbsolute)) {
//           return {
//             code: "EACCES",
//             message: "Access denied: path outside allowed directory",
//             result: false
//           };
//         }
//         // Calcular el path relativo desde el root para mostrar
//         targetPath = path.relative(rootAbsolute, resolvedPath) || ".";
//       } else {
//         // Path relativo: resolver desde el root
//         resolvedPath = path.resolve(rootAbsolute, cleanPath);
//         targetPath = cleanPath;

//         // Security check: ensure path stays within root directory
//         if (!resolvedPath.startsWith(rootAbsolute)) {
//           return {
//             code: "EACCES",
//             message: "Access denied: path outside allowed directory",
//             result: false
//           };
//         }
//       }
//     }

//     const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
//     const result = entries.map((entry) => ({
//       name: entry.name,
//       type: entry.isDirectory() ? "folder" : "file",
//     }));

//     return {
//       message: "OK",
//       result,
//       path: targetPath === "." ? rootDir : targetPath
//     };
//   } catch (error) {
//     logger.debug("ls_command_failed", {
//       path: requestedPath,
//       error: error.message
//     });

//     // Proporcionar un mensaje más específico según el tipo de error
//     if (error.code === "ENOENT") {
//       return {
//         code: "ENOENT",
//         message: "Path not found",
//         result: false
//       };
//     } else if (error.code === "EACCES") {
//       return {
//         code: "EACCES",
//         message: "Permission denied",
//         result: false
//       };
//     } else {
//       return {
//         code: "ERROR",
//         message: `Error accessing path: ${error.message}`,
//         result: false
//       };
//     }
//   }
// }
