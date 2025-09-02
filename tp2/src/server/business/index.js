import Ajv from "ajv";

import * as getOsInfoModule from "./commands/getosinfo/index.js";
import * as quitModule from "./commands/quit/index.js";
import * as watchModule from "./commands/watch/index.js";
import * as getWatchesModule from "./commands/getwatches/index.js";
import * as psModule from "./commands/ps/index.js";
import * as osCmdModule from "./commands/oscmd/index.js";

import { startSampler } from "./metrics/sampler.js";

const ajv = new Ajv({ allErrors: true });

const commands = new Map(); // act -> command handler
const validators = new Map(); // act -> ajv validator

function registerModule(module) {
  const { act, command, schema } = module;

  if (!act || !command) {
    throw new Error(
      `Module missing exports: act=${!!act}, command=${!!command}`
    );
  }

  commands.set(act, command);

  if (schema) {
    validators.set(act, ajv.compile(schema));
  }
}

export function initializeModules() {
  [
    getOsInfoModule,
    quitModule,
    watchModule,
    getWatchesModule,
    psModule,
    osCmdModule,
  ].forEach(registerModule); // Registrar todos los módulos de comandos
  startSampler(); // Iniciar muestreo de métricas de sistema
}

export const getCommand = (act) => commands.get(act);

export const validatePayload = (act, payload) => {
  const validator = validators.get(act);
  if (!validator) return { valid: true };
  const valid = validator(payload);
  return { valid, errors: valid ? null : validator.errors };
};
