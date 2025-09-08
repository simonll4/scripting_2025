export default {
  type: "object",
  additionalProperties: false,
  properties: {
    token: { type: "string", minLength: 1 },
    since: { type: "number", minimum: 0 },
    until: { type: "number", minimum: 0 },
    limit: { type: "number", minimum: 1, maximum: 10000 },
  },
  required: ["token"],
};
