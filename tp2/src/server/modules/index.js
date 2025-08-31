/**
 * SISTEMA DE MÓDULOS SIMPLIFICADO
 *
 * Importa y registra comandos de negocio.
 * Solo incluye lo que realmente se usa.
 */

import Ajv from "ajv";

// Importaciones directas de módulos business
import * as getOsInfoModule from "./business/getosinfo/index.js";
import * as quitModule from "./business/quit/index.js";

// Configuración de validador JSON Schema
const ajv = new Ajv({ allErrors: true });

// Registry de comandos y validadores
const commands = new Map();
const validators = new Map();

/**
 * Registra un módulo en el sistema
 */
function registerModule(module) {
  const { act, command, schema } = module;

  if (!act || !command) {
    throw new Error(
      `Module missing required exports: ${JSON.stringify({
        act: !!act,
        command: !!command,
      })}`
    );
  }

  commands.set(act, command);

  if (schema) {
    validators.set(act, ajv.compile(schema));
  }
}

/**
 * Inicializa el sistema de módulos
 */
export function initializeModules() {
  // Registrar todos los módulos business
  registerModule(getOsInfoModule);
  registerModule(quitModule);

  console.log(`✓ Module system ready: ${commands.size} commands loaded`);

  // TODO: Return value not used anywhere - only kept for potential debugging
  // Could be removed to simplify the function
  return {
    loaded: commands.size,
    failed: [],
    commands: Array.from(commands.keys()),
  };
}

/**
 * API pública del sistema de módulos
 */
export const getCommand = (act) => commands.get(act);

export const validatePayload = (act, payload) => {
  const validator = validators.get(act);
  if (!validator) return { valid: true };

  const valid = validator(payload);
  return { valid, errors: valid ? null : validator.errors };
};
