export default {
  type: "object",
  additionalProperties: false,
  properties: {
    token: { type: "string", minLength: 1 },
    // Opcionalmente podrías agregar filtros, e.g. since timestamp
    // since: { type: "integer", minimum: 0 }
  },
  required: ["token"],
};
