export default {
  type: "object",
  additionalProperties: false,
  properties: {
    path: { type: "string", minLength: 1 },
    durationSeconds: {
      type: "integer",
      minimum: 1,
      maximum: 3600,
      default: 60,
    },
  },
  required: ["path"],
};
