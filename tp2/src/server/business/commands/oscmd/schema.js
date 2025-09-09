// Esquema AJV: valida forma y cotas, y fuerza 'cmd' a la enum de la whitelist.
// La validación fina de flags y el saneamiento de rutas se hace en runtime.

import { OS_CMD_POLICY } from "./config.js";

export default {
  type: "object",
  additionalProperties: false,
  properties: {
    cmd: { type: "string", enum: Object.keys(OS_CMD_POLICY.binaries) },
    args: {
      type: "array",
      items: { type: "string", maxLength: OS_CMD_POLICY.maxArgLen },
      maxItems: OS_CMD_POLICY.maxArgs,
      default: [],
    },
    timeoutMs: {
      type: "integer",
      minimum: 1000,
      maximum: OS_CMD_POLICY.timeoutMsMax,
      default: OS_CMD_POLICY.timeoutMsDefault,
    },
  },
  required: ["cmd"],
};
