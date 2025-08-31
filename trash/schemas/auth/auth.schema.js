export const authSchema = {
  type: "object",
  properties: {
    token: { type: "string", minLength: 10 },
  },
  required: ["token"],
  additionalProperties: false,
};
