/**
 * ============================================================================
 * BUSINESS COMMANDS REGISTRY - Camera System TP3.0
 * ============================================================================
 * Registro central de comandos y sus handlers
 */

import { PROTOCOL } from "../../protocol/index.js";
import { SCOPES } from "../security/index.js";
import { handleSnapshot } from "./commands/snapshot/index.js";
import { withAuth } from "../core/middleware/auth-guard.js";

/**
 * Registro de comandos con sus handlers - Solo captura de snapshots
 */
export const COMMAND_REGISTRY = {
  [PROTOCOL.COMMANDS.SNAPSHOT]: {
    handler: withAuth(handleSnapshot, [SCOPES.SNAPSHOT_CREATE]),
    scopes: [SCOPES.SNAPSHOT_CREATE],
  },
};

/**
 * Obtiene el handler para un comando
 */
export function getCommandHandler(command) {
  const commandInfo = COMMAND_REGISTRY[command];
  return commandInfo?.handler || null;
}

/**
 * Verifica si un comando existe
 */
export function isValidCommand(command) {
  return command in COMMAND_REGISTRY;
}

