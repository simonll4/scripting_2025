export const getOsInfoSchema = {
  type: "object",
  properties: {
    seconds: { type: "integer", minimum: 0, maximum: 3600, default: 60 },
  },
  required: [],
  additionalProperties: false,
};
