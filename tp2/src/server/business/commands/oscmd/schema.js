import { OS_CMD_POLICY } from "./config.js";

export default {
  type: "object",
  additionalProperties: false,
  properties: {
    cmd: { type: "string", enum: Object.keys(OS_CMD_POLICY.binaries) },
    args: {
      type: "array",
      maxItems: OS_CMD_POLICY.maxArgs,
      items: { type: "string", maxLength: OS_CMD_POLICY.maxArgLen },
      default: [],
    },
    timeoutMs: {
      type: "integer",
      minimum: 100,
      maximum: OS_CMD_POLICY.timeoutMsMax,
      default: OS_CMD_POLICY.timeoutMsDefault,
    },
  },
  required: ["cmd"],
};
