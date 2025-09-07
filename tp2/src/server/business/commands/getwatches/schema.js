export default {
  type: "object",
  additionalProperties: false,
  properties: {
    token: { type: "string", minLength: 1 },
  },
  required: ["token"],
};
