import Ajv from 'ajv';
import { authSchema } from './schema.js';

// Instancia de AJV para validación de schemas
const ajv = new Ajv({ allErrors: true });

// Compilar el schema de AUTH una sola vez
const validateAuthPayload = ajv.compile(authSchema);

/**
 * Valida el payload de un request de autenticación
 * @param {Object} payload - Los datos a validar
 * @returns {Object} { valid: boolean, errors?: Array }
 */
export function validateAuth(payload) {
  const valid = validateAuthPayload(payload);
  
  if (!valid) {
    return {
      valid: false,
      errors: validateAuthPayload.errors
    };
  }
  
  return { valid: true };
}
