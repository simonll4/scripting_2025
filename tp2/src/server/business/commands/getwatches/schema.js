export default {
  type: "object",
  additionalProperties: false,
  properties: {
    token: { type: "string", minLength: 1 },
    since: { type: "number", minimum: 0 },
    until: { type: "number", minimum: 0 },
    pageSize: { type: "number", minimum: 1, maximum: 10000, default: 1000 },
    order: { enum: ["asc", "desc"], default: "asc" },
    cursor: { type: "string", minLength: 1 },
  },
  required: ["token"],
};
