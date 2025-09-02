export default {
  type: "object",
  additionalProperties: false,
  properties: {
    cmd: { type: "string", minLength: 1 },
    args: {
      type: "array",
      items: { type: "string" },
      default: [],
    },
    // En el futuro: timeoutMs, cwd, env (con whitelists), etc.
  },
  required: ["cmd"],
};
