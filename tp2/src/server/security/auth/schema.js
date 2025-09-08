/**
 * Schema de validación para AUTH requests
 * Usado por AuthGuard para validar payload de autenticación
 */
export const authSchema = {
  type: "object",
  properties: {
    token: { type: "string", minLength: 10 },
  },
  required: ["token"],
  additionalProperties: false,
};
