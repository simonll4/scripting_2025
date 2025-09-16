/**
 * ============================================================================
 * MESSAGE VALIDATOR
 * ============================================================================
 * Validador de mensajes MQTT extraído del subscriber
 */

import { createLogger } from "../../utils/logger.js";

const logger = createLogger("SAVER-VALIDATOR");

/**
 * Valida estructura de mensaje de snapshot
 */
export function validateMessage(message) {
  if (!message || typeof message !== "object") {
    return { valid: false, error: "Message must be an object" };
  }

  // Campos requeridos
  const requiredFields = ["cameraId", "timestamp", "data", "format", "encoding"];
  for (const field of requiredFields) {
    if (!(field in message)) {
      return { valid: false, error: `Missing required field: ${field}` };
    }
  }

  // Validar cameraId
  if (typeof message.cameraId !== "string" || !message.cameraId.trim()) {
    return { valid: false, error: "cameraId must be a non-empty string" };
  }

  // Validar timestamp
  if (typeof message.timestamp !== "number" || message.timestamp <= 0) {
    return { valid: false, error: "timestamp must be a positive number" };
  }

  // Validar data
  if (typeof message.data !== "string" || !message.data) {
    return { valid: false, error: "data must be a non-empty string" };
  }

  // Validar format
  const validFormats = ["image/jpeg", "image/png"];
  if (!validFormats.includes(message.format)) {
    return { valid: false, error: `format must be one of: ${validFormats.join(", ")}` };
  }

  // Validar encoding
  const validEncodings = ["base64"];
  if (!validEncodings.includes(message.encoding)) {
    return { valid: false, error: `encoding must be one of: ${validEncodings.join(", ")}` };
  }

  // Validar dimensiones opcionales
  if (
    message.width !== undefined &&
    (typeof message.width !== "number" || message.width <= 0)
  ) {
    return { valid: false, error: "width must be a positive number" };
  }

  if (
    message.height !== undefined &&
    (typeof message.height !== "number" || message.height <= 0)
  ) {
    return { valid: false, error: "height must be a positive number" };
  }

  // Validar quality opcional
  if (
    message.quality !== undefined &&
    (typeof message.quality !== "number" ||
      message.quality < 1 ||
      message.quality > 100)
  ) {
    return {
      valid: false,
      error: "quality must be a number between 1 and 100",
    };
  }

  // Validar tamaño de datos base64
  try {
    const buffer = Buffer.from(message.data, message.encoding);
    if (buffer.length === 0) {
      return { valid: false, error: "decoded data is empty" };
    }

    // Verificar que sea una imagen válida (magic bytes)
    if (message.format === "image/jpeg") {
      if (buffer.length < 2 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
        return {
          valid: false,
          error: "invalid JPEG data (missing magic bytes)",
        };
      }
    } else if (message.format === "image/png") {
      const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
      if (buffer.length < 8) {
        return { valid: false, error: "invalid PNG data (too short)" };
      }
      for (let i = 0; i < 8; i++) {
        if (buffer[i] !== pngSignature[i]) {
          return {
            valid: false,
            error: "invalid PNG data (missing signature)",
          };
        }
      }
    }
  } catch (error) {
    return { valid: false, error: `failed to decode data: ${error.message}` };
  }

  return { valid: true };
}

/**
 * Validador con métricas
 */
export class MessageValidator {
  constructor() {
    this.stats = {
      totalValidated: 0,
      validMessages: 0,
      invalidMessages: 0,
      errorsByType: {},
    };
  }

  /**
   * Valida un mensaje y actualiza estadísticas
   */
  validate(message) {
    this.stats.totalValidated++;
    
    const result = validateMessage(message);
    
    if (result.valid) {
      this.stats.validMessages++;
    } else {
      this.stats.invalidMessages++;
      
      // Categorizar errores
      const errorType = this.categorizeError(result.error);
      this.stats.errorsByType[errorType] = (this.stats.errorsByType[errorType] || 0) + 1;
      
      logger.warn(`Message validation failed: ${result.error}`);
    }

    return result;
  }

  /**
   * Categoriza errores para estadísticas
   */
  categorizeError(errorMessage) {
    if (errorMessage.includes("Missing required field")) {
      return "missing_field";
    } else if (errorMessage.includes("cameraId")) {
      return "invalid_camera_id";
    } else if (errorMessage.includes("timestamp")) {
      return "invalid_timestamp";
    } else if (errorMessage.includes("data")) {
      return "invalid_data";
    } else if (errorMessage.includes("format")) {
      return "invalid_format";
    } else if (errorMessage.includes("encoding")) {
      return "invalid_encoding";
    } else if (
      errorMessage.includes("magic bytes") ||
      errorMessage.includes("signature")
    ) {
      return "invalid_image";
    } else {
      return "other";
    }
  }

  /**
   * Obtiene estadísticas de validación
   */
  getStats() {
    const successRate = this.stats.totalValidated > 0 
      ? (this.stats.validMessages / this.stats.totalValidated) * 100 
      : 0;

    return {
      ...this.stats,
      successRate: parseFloat(successRate.toFixed(2)),
    };
  }

  /**
   * Resetea estadísticas
   */
  resetStats() {
    this.stats = {
      totalValidated: 0,
      validMessages: 0,
      invalidMessages: 0,
      errorsByType: {},
    };
  }
}

/**
 * Valida payload JSON completo (función standalone)
 */
export function validatePayload(payload) {
  try {
    const message = JSON.parse(payload);
    return validateMessage(message);
  } catch (error) {
    return { valid: false, error: `Invalid JSON: ${error.message}` };
  }
}

/**
 * Extrae metadatos del mensaje (función standalone)
 */
export function extractMetadata(message) {
  const imageBuffer = Buffer.from(message.data, "base64");

  return {
    cameraId: message.cameraId || "unknown",
    timestamp: message.timestamp,
    format: message.format,
    encoding: message.encoding,
    size: imageBuffer.length,
    width: message.width || null,
    height: message.height || null,
    quality: message.quality || null,
  };
}
