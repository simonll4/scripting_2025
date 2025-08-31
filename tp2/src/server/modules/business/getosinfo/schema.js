export default {
  type: "object",
  additionalProperties: false,
  properties: {
    seconds: { type: "integer", minimum: 1, maximum: 86400, default: 60 }
  },
  required: []
};
